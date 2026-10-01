from __future__ import annotations

import json, os, shutil, uuid, math, statistics
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional, Any

import numpy as np
import open3d as o3d
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from .security import AUTH_REQUIRED, seed_admin, issue_token, decode_token, _load as load_auth, hash_password, has_permission, permissions_for

try:
    import laspy
except Exception:
    laspy = None

try:
    import ifcopenshell
    import ifcopenshell.geom
except Exception:
    ifcopenshell = None

BASE = Path(__file__).resolve().parents[1]
DATA = BASE / "data"
UPLOADS = BASE / "storage"
DATA.mkdir(exist_ok=True)
UPLOADS.mkdir(exist_ok=True)
JOBS: dict[str, dict[str, Any]] = {}

app = FastAPI(title="PMS Reality Processing & Progress Engine", version="6.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# Optional production authentication. Keep disabled for local/offline operation.
seed_admin()

def current_identity(authorization: str | None = Header(default=None)):
    if not AUTH_REQUIRED:
        return {"username": "local", "role": "مدير عام", "authRequired": False}
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Bearer token مطلوب.")
    token = authorization.split(" ",1)[1].strip()
    identity = decode_token(token)
    if not identity:
        raise HTTPException(401, "جلسة الدخول غير صالحة أو منتهية.")
    user = load_auth().get(identity.get("sub"))
    if not user or not user.get("active", True):
        raise HTTPException(403, "الحساب غير نشط.")
    return identity

def require_roles(*roles):
    def guard(identity=Depends(current_identity)):
        if AUTH_REQUIRED and roles and identity.get("role") not in roles:
            raise HTTPException(403, "لا تملك صلاحية تنفيذ هذا الإجراء.")
        return identity
    return guard

def require_permission(permission: str):
    """Authoritative server-side permission guard. Never rely on client visibility."""
    def guard(identity=Depends(current_identity)):
        if AUTH_REQUIRED and not has_permission(identity.get("role"), permission):
            raise HTTPException(403, "لا تملك صلاحية تنفيذ هذا الإجراء.")
        return identity
    return guard

@app.post("/api/auth/login")
async def auth_login(payload: dict):
    username = str(payload.get("username") or "").strip()
    password = str(payload.get("password") or "")
    user = load_auth().get(username)
    from .security import verify_password
    if not user or not user.get("active", True) or not verify_password(password, user.get("salt", ""), user.get("passwordHash", "")):
        raise HTTPException(401, "اسم المستخدم أو كلمة المرور غير صحيحة.")
    return {"access_token": issue_token(user), "token_type":"bearer", "expiresIn": 28800, "user":{"username":username,"role":user["role"]}}

@app.get("/api/auth/me")
async def auth_me(identity=Depends(current_identity)):
    return identity

@app.get("/api/security/status")
async def security_status(identity=Depends(current_identity)):
    return {"authRequired":AUTH_REQUIRED,"tokenTTLSeconds":28800,"role":identity.get("role"),
            "permissions":permissions_for(identity.get("role")),
            "controls":["PBKDF2-SHA256","signed bearer token","server-side RBAC","audit-compatible request identity"]}


def now():
    return datetime.now(timezone.utc).isoformat()


def save_upload(upload: UploadFile, job_id: str, role: str) -> Path:
    folder = UPLOADS / job_id
    folder.mkdir(parents=True, exist_ok=True)
    suffix = Path(upload.filename or "file").suffix.lower()
    path = folder / f"{role}{suffix}"
    with path.open("wb") as f:
        shutil.copyfileobj(upload.file, f)
    return path


def load_point_cloud(path: Path) -> o3d.geometry.PointCloud:
    ext = path.suffix.lower()
    if ext in {".las", ".laz"}:
        if laspy is None:
            raise RuntimeError("laspy غير مثبت؛ أضف laspy إلى بيئة المحرك.")
        las = laspy.read(path)
        pts = np.column_stack((las.x, las.y, las.z)).astype(np.float64)
        pcd = o3d.geometry.PointCloud(o3d.utility.Vector3dVector(pts))
        if hasattr(las, "red"):
            rgb = np.column_stack((las.red, las.green, las.blue)).astype(np.float64)
            denom = max(float(rgb.max()), 1.0)
            pcd.colors = o3d.utility.Vector3dVector(rgb / denom)
        return pcd
    if ext in {".ply", ".pcd", ".xyz", ".xyzn", ".xyzrgb"}:
        pcd = o3d.io.read_point_cloud(str(path))
        if len(pcd.points) == 0:
            raise RuntimeError("لم يتم العثور على نقاط في ملف المسح.")
        return pcd
    if ext == ".csv":
        arr = np.loadtxt(path, delimiter=",", ndmin=2)
        if arr.shape[1] < 3:
            raise RuntimeError("CSV يجب أن يحتوي X,Y,Z على الأقل.")
        return o3d.geometry.PointCloud(o3d.utility.Vector3dVector(arr[:, :3]))
    raise RuntimeError(f"صيغة سحابة النقاط غير مدعومة: {ext}")


def preprocess_pcd(pcd: o3d.geometry.PointCloud, voxel: float) -> o3d.geometry.PointCloud:
    ds = pcd.voxel_down_sample(voxel)
    if len(ds.points) < 50:
        ds = pcd
    if len(ds.points) >= 10:
        ds.estimate_normals(o3d.geometry.KDTreeSearchParamHybrid(radius=max(voxel * 2.5, 0.02), max_nn=30))
    return ds


def mesh_from_file(path: Path) -> o3d.geometry.TriangleMesh:
    ext = path.suffix.lower()
    if ext in {".obj", ".ply", ".stl", ".off", ".gltf", ".glb"}:
        mesh = o3d.io.read_triangle_mesh(str(path), enable_post_processing=True)
        if len(mesh.triangles) == 0:
            raise RuntimeError("ملف الهندسة لا يحتوي Mesh صالحاً.")
        mesh.compute_vertex_normals()
        return mesh
    if ext == ".ifc":
        if ifcopenshell is None:
            raise RuntimeError("ifcopenshell غير مثبت؛ لا يمكن استخراج هندسة IFC.")
        return mesh_from_ifc(path)
    raise RuntimeError(f"صيغة BIM غير مدعومة: {ext}. استخدم IFC أو OBJ/PLY/GLB.")


def mesh_from_ifc(path: Path) -> o3d.geometry.TriangleMesh:
    model = ifcopenshell.open(str(path))
    settings = ifcopenshell.geom.settings()
    settings.set(settings.USE_WORLD_COORDS, True)
    vertices, triangles = [], []
    # Geometry iterator is materially faster for whole-model IFC processing.
    try:
        iterator = ifcopenshell.geom.iterator(settings, model, max(1, os.cpu_count() or 1), geometry_library="hybrid-cgal-simple-opencascade")
        if iterator.initialize():
            while True:
                shape = iterator.get()
                g = shape.geometry
                vs = np.asarray(g.verts, dtype=float).reshape(-1, 3)
                ts = np.asarray(g.faces, dtype=int).reshape(-1, 3)
                base = len(vertices)
                vertices.extend(vs.tolist())
                triangles.extend((ts + base).tolist())
                if not iterator.next():
                    break
    except Exception:
        # Fallback for IFC files/kernels where the iterator is unavailable.
        for product in model.by_type("IfcProduct"):
            if not getattr(product, "Representation", None):
                continue
            try:
                shape = ifcopenshell.geom.create_shape(settings, product)
                g = shape.geometry
                vs = np.asarray(g.verts, dtype=float).reshape(-1, 3)
                ts = np.asarray(g.faces, dtype=int).reshape(-1, 3)
                base = len(vertices)
                vertices.extend(vs.tolist())
                triangles.extend((ts + base).tolist())
            except Exception:
                continue
    if not triangles:
        raise RuntimeError("تعذر استخراج هندسة قابلة للتحليل من IFC.")
    mesh = o3d.geometry.TriangleMesh(
        o3d.utility.Vector3dVector(np.asarray(vertices)),
        o3d.utility.Vector3iVector(np.asarray(triangles)),
    )
    mesh.remove_duplicated_vertices(); mesh.remove_degenerate_triangles(); mesh.compute_vertex_normals()
    return mesh


def apply_scale_correction(pcd: o3d.geometry.PointCloud, measured_m: float, true_m: float):
    """Apply a user-verified linear scale correction around the cloud centroid.
    This corrects scale bias only; it does not replace spatial registration or survey control.
    """
    if measured_m <= 0 or true_m <= 0:
        raise ValueError("measured_m و true_m يجب أن يكونا أكبر من صفر.")
    factor = float(true_m) / float(measured_m)
    out = o3d.geometry.PointCloud(pcd)
    pts = np.asarray(out.points).copy()
    if len(pts):
        c = np.mean(pts, axis=0)
        pts = (pts - c) * factor + c
        out.points = o3d.utility.Vector3dVector(pts)
    if len(out.colors):
        out.colors = o3d.utility.Vector3dVector(np.asarray(out.colors).copy())
    return out, factor




def umeyama_similarity(src: np.ndarray, dst: np.ndarray, with_scale: bool = True):
    """Estimate 3D similarity transform src -> dst using Umeyama least-squares method."""
    src = np.asarray(src, dtype=float); dst = np.asarray(dst, dtype=float)
    if src.shape != dst.shape or src.ndim != 2 or src.shape[1] != 3 or len(src) < 3:
        raise ValueError("يلزم 3 نقاط تحكم ثلاثية الأبعاد على الأقل وبنفس الترتيب.")
    mu_s = src.mean(axis=0); mu_d = dst.mean(axis=0)
    X = src - mu_s; Y = dst - mu_d
    cov = (Y.T @ X) / len(src)
    U, D, Vt = np.linalg.svd(cov)
    S = np.eye(3)
    if np.linalg.det(U @ Vt) < 0: S[-1, -1] = -1
    R = U @ S @ Vt
    var_s = np.sum(X * X) / len(src)
    scale = float(np.sum(D * np.diag(S)) / max(var_s, 1e-15)) if with_scale else 1.0
    t = mu_d - scale * (R @ mu_s)
    pred = (scale * (R @ src.T)).T + t
    residuals = np.linalg.norm(pred - dst, axis=1)
    return scale, R, t, residuals


def transform_cloud(pcd: o3d.geometry.PointCloud, scale: float, R: np.ndarray, t: np.ndarray):
    out = o3d.geometry.PointCloud(pcd)
    pts = np.asarray(out.points)
    if len(pts): out.points = o3d.utility.Vector3dVector((scale * (R @ pts.T)).T + t)
    return out

def calibration_quality(factor: float):
    error_pct = abs(factor - 1.0) * 100.0
    if error_pct <= 0.5:
        level = "excellent"
    elif error_pct <= 1.5:
        level = "good"
    elif error_pct <= 3.0:
        level = "review"
    else:
        level = "poor"
    return round(error_pct, 3), level


def register_clouds(source: o3d.geometry.PointCloud, target: o3d.geometry.PointCloud, voxel: float):
    s = preprocess_pcd(source, voxel)
    t = preprocess_pcd(target, voxel)
    if len(s.points) < 20 or len(t.points) < 20:
        raise RuntimeError("سحابة النقاط صغيرة جداً لإجراء Registration موثوق.")
    radius = max(voxel * 2.5, 0.02)
    sf = o3d.pipelines.registration.compute_fpfh_feature(s, o3d.geometry.KDTreeSearchParamHybrid(radius=radius * 2, max_nn=100))
    tf = o3d.pipelines.registration.compute_fpfh_feature(t, o3d.geometry.KDTreeSearchParamHybrid(radius=radius * 2, max_nn=100))
    try:
        ransac = o3d.pipelines.registration.registration_ransac_based_on_feature_matching(
            s, t, sf, tf, mutual_filter=True,
            max_correspondence_distance=voxel * 2.5,
            estimation_method=o3d.pipelines.registration.TransformationEstimationPointToPoint(False),
            ransac_n=4,
            checkers=[
                o3d.pipelines.registration.CorrespondenceCheckerBasedOnEdgeLength(0.9),
                o3d.pipelines.registration.CorrespondenceCheckerBasedOnDistance(voxel * 2.5),
            ],
            criteria=o3d.pipelines.registration.RANSACConvergenceCriteria(100000, 0.999),
        )
    except TypeError:
        # Compatibility with newer Open3D tensor/legacy signatures.
        ransac = o3d.pipelines.registration.registration_ransac_based_on_feature_matching(
            s, t, sf, tf, True, voxel * 2.5,
            o3d.pipelines.registration.TransformationEstimationPointToPoint(False), 4,
            [o3d.pipelines.registration.CorrespondenceCheckerBasedOnEdgeLength(0.9),
             o3d.pipelines.registration.CorrespondenceCheckerBasedOnDistance(voxel * 2.5)],
            o3d.pipelines.registration.RANSACConvergenceCriteria(100000, 0.999)
        )
    icp = o3d.pipelines.registration.registration_icp(
        s, t, voxel * 1.5, ransac.transformation,
        o3d.pipelines.registration.TransformationEstimationPointToPlane(),
        o3d.pipelines.registration.ICPConvergenceCriteria(max_iteration=80),
    )
    return icp, ransac


def registration_confidence(fitness: float, rmse: float, voxel: float) -> float:
    return max(0.0, min(1.0, 0.55 * fitness + 0.45 * math.exp(-rmse / max(voxel, 1e-9))))


def nearest_distances(source_points: np.ndarray, target: o3d.geometry.PointCloud, sample_limit: int = 50000):
    if len(source_points) == 0 or len(target.points) == 0:
        return np.array([])
    if len(source_points) > sample_limit:
        idx = np.linspace(0, len(source_points) - 1, sample_limit).astype(int)
        pts = source_points[idx]
    else:
        pts = source_points
    tree = o3d.geometry.KDTreeFlann(target)
    distances = []
    for p in pts:
        k, _, d2 = tree.search_knn_vector_3d(p, 1)
        if k:
            distances.append(math.sqrt(float(d2[0])))
    return np.asarray(distances, dtype=float)


def distance_stats(distances: np.ndarray, tolerance: float):
    if len(distances) == 0:
        return {"count": 0, "meanM": None, "medianM": None, "p95M": None, "maxM": None, "withinTolerancePct": None}
    return {
        "count": int(len(distances)),
        "meanM": round(float(np.mean(distances)), 5),
        "medianM": round(float(np.median(distances)), 5),
        "p95M": round(float(np.percentile(distances, 95)), 5),
        "maxM": round(float(np.max(distances)), 5),
        "withinTolerancePct": round(float(np.mean(distances <= tolerance) * 100), 2),
    }


def voxel_signature(pcd: o3d.geometry.PointCloud, voxel: float):
    pts = np.asarray(pcd.points)
    if len(pts) == 0:
        return set()
    origin = np.min(pts, axis=0)
    ijk = np.floor((pts - origin) / voxel).astype(np.int64)
    return {tuple(x) for x in ijk}


def voxel_change_metrics(before: o3d.geometry.PointCloud, after: o3d.geometry.PointCloud, voxel: float):
    a = voxel_signature(before, voxel)
    b = voxel_signature(after, voxel)
    union = a | b
    added = b - a
    removed = a - b
    unchanged = a & b
    volume = voxel ** 3
    return {
        "voxelSizeM": voxel,
        "beforeOccupiedVoxels": len(a),
        "afterOccupiedVoxels": len(b),
        "unionVoxels": len(union),
        "addedVoxels": len(added),
        "removedVoxels": len(removed),
        "unchangedVoxels": len(unchanged),
        "addedVolumeM3": round(len(added) * volume, 4),
        "removedVolumeM3": round(len(removed) * volume, 4),
        "grossChangedVolumeM3": round((len(added) + len(removed)) * volume, 4),
        "changeRatePct": round(((len(added) + len(removed)) / max(len(union), 1)) * 100, 2),
        "occupancyIncreasePct": round(((len(b) - len(a)) / max(len(a), 1)) * 100, 2),
    }


def ifc_elements(path: Path):
    if ifcopenshell is None:
        return []
    model = ifcopenshell.open(str(path))
    return [x for x in model.by_type("IfcProduct") if getattr(x, "Representation", None)]


def property_value(product, wanted: set[str]):
    """Find common progress/status properties in IFC property sets."""
    wanted_norm = {w.lower().replace(" ", "").replace("_", "") for w in wanted}
    values = []
    try:
        for definition in getattr(product, "IsDefinedBy", []) or []:
            rel = definition.RelatingPropertyDefinition
            for p in getattr(rel, "HasProperties", []) or []:
                name = str(getattr(p, "Name", ""))
                norm = name.lower().replace(" ", "").replace("_", "")
                if norm in wanted_norm:
                    val = getattr(getattr(p, "NominalValue", None), "wrappedValue", None)
                    if val is not None:
                        values.append((name, val))
    except Exception:
        pass
    return values


def numeric_property(product, wanted: set[str]):
    vals = property_value(product, wanted)
    for _, val in vals:
        try:
            x = float(val)
            if math.isfinite(x) and x > 0:
                return x
        except Exception:
            pass
    return None


def extract_bim_progress(path: Path):
    if path.suffix.lower() != ".ifc":
        return {"available": False, "reason": "استخراج نسبة الإنجاز من خصائص BIM مدعوم حالياً لـ IFC."}
    elements = ifc_elements(path)
    rows = []
    progress_names = {"Progress", "Completion", "CompletionPct", "ProgressPct", "PercentComplete", "PhysicalProgress", "StatusProgress"}
    status_names = {"Status", "ConstructionStatus", "PhaseStatus"}
    weight_names = {"ScheduleWeight", "ProgressWeight", "Weight", "Cost", "Volume", "Area", "Length", "Quantity"}
    for e in elements:
        vals = property_value(e, progress_names)
        pct = None; source = None
        for name, val in vals:
            try:
                x = float(val)
                if x <= 1: x *= 100
                if 0 <= x <= 100:
                    pct = x; source = name; break
            except Exception:
                continue
        status = None
        if pct is None:
            for name, val in property_value(e, status_names):
                status = str(val); st = status.lower()
                if any(k in st for k in ["complete", "completed", "installed", "asbuilt", "finished"]):
                    pct = 100.0; source = name
                elif any(k in st for k in ["progress", "started", "ongoing", "construction"]):
                    pct = 50.0; source = name
                elif any(k in st for k in ["notstarted", "planned", "future"]):
                    pct = 0.0; source = name
                break
        if pct is not None:
            weight = numeric_property(e, weight_names) or 1.0
            rows.append({"ifcGuid": e.GlobalId, "name": getattr(e, "Name", None) or e.GlobalId, "type": e.is_a(), "progressPct": round(pct, 2), "source": source, "weight": round(weight, 6)})
    if not rows:
        return {"available": False, "reason": "لم توجد خصائص Progress/Completion أو حالة تنفيذ قابلة للتحويل إلى نسبة. الـBIM وحده لا يثبت الإنجاز الميداني؛ يلزم 4D/status data أو مسح فعلي.", "elementsInModel": len(elements)}
    total_weight = sum(r["weight"] for r in rows)
    weighted = sum(r["progressPct"] * r["weight"] for r in rows) / max(total_weight, 1e-9)
    simple = float(np.mean([r["progressPct"] for r in rows]))
    return {"available": True, "method": "IFC element progress/status properties with quantity/cost/schedule weighting when available", "elementsInModel": len(elements), "elementsWithProgress": len(rows), "projectProgressPct": round(weighted, 2), "simpleAveragePct": round(simple, 2), "totalWeight": round(total_weight, 6), "elements": rows[:10000]}


def element_analysis_ifc(scan_aligned: o3d.geometry.PointCloud, path: Path, tolerance: float):
    if ifcopenshell is None:
        return []
    model = ifcopenshell.open(str(path))
    settings = ifcopenshell.geom.settings(); settings.set(settings.USE_WORLD_COORDS, True)
    results = []
    scan_tree = o3d.geometry.KDTreeFlann(scan_aligned)
    for product in model.by_type("IfcProduct"):
        if not getattr(product, "Representation", None):
            continue
        try:
            shape = ifcopenshell.geom.create_shape(settings, product)
            g = shape.geometry
            vs = np.asarray(g.verts, dtype=float).reshape(-1, 3)
            ts = np.asarray(g.faces, dtype=int).reshape(-1, 3)
            if len(ts) == 0:
                continue
            mesh = o3d.geometry.TriangleMesh(o3d.utility.Vector3dVector(vs), o3d.utility.Vector3iVector(ts))
            sample_n = min(max(len(ts) * 3, 150), 5000)
            elem = mesh.sample_points_uniformly(number_of_points=sample_n)
            pts = np.asarray(elem.points)
            distances = []
            for p in pts[::max(1, len(pts) // 700)]:
                k, _, d2 = scan_tree.search_knn_vector_3d(p, 1)
                if k:
                    distances.append(math.sqrt(float(d2[0])))
            if not distances:
                continue
            arr = np.asarray(distances)
            coverage = float(np.mean(arr <= tolerance) * 100)
            results.append({
                "ifcGuid": product.GlobalId,
                "elementType": product.is_a(),
                "name": getattr(product, "Name", None) or getattr(product, "Tag", None) or product.GlobalId,
                "meanDeviationM": round(float(np.mean(arr)), 5),
                "p95DeviationM": round(float(np.percentile(arr, 95)), 5),
                "maxDeviationM": round(float(np.max(arr)), 5),
                "toleranceM": tolerance,
                "surfaceCoveragePct": round(coverage, 2),
                "status": "VERIFIED" if coverage >= 70 and float(np.percentile(arr, 95)) <= tolerance else "REVIEW",
                "sampleCount": len(distances),
                "weight": numeric_property(product, {"ScheduleWeight", "ProgressWeight", "Weight", "Cost", "Volume", "Area", "Length", "Quantity"}) or 1.0,
            })
        except Exception:
            continue
    results.sort(key=lambda x: x["surfaceCoveragePct"])
    return results


def save_result(payload):
    (DATA / f"{payload['analysisId']}.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    JOBS[payload["analysisId"]] = payload


@app.get("/health")
def health():
    return {
        "status": "ok", "engine": "PMS Reality Processing & Progress Engine", "version": app.version,
        "open3d": o3d.__version__, "ifc": ifcopenshell is not None, "las": laspy is not None,
        "capabilities": ["scan-vs-bim", "scan-to-scan", "progress-history", "bim-progress-properties", "element-verification", "change-volume"],
    }


@app.post("/api/reality/analyze")
async def analyze_reality(
    identity=Depends(require_roles("مدير عام","مالك الشركة","مدير المشروع","مدير PMO")),
    point_cloud: UploadFile = File(...), bim: UploadFile = File(...), project_id: str = Form(""),
    voxel_size: float = Form(0.05), tolerance_m: float = Form(0.025),
):
    if voxel_size <= 0 or tolerance_m <= 0:
        raise HTTPException(400, "voxel_size و tolerance_m يجب أن يكونا أكبر من صفر.")
    job_id = str(uuid.uuid4()); JOBS[job_id] = {"status": "processing", "createdAt": now(), "projectId": project_id}
    try:
        scan_path = save_upload(point_cloud, job_id, "scan"); bim_path = save_upload(bim, job_id, "bim")
        scan = load_point_cloud(scan_path); mesh = mesh_from_file(bim_path)
        icp, ransac = register_clouds(scan, mesh.sample_points_uniformly(number_of_points=min(max(len(scan.points), 10000), 150000)), voxel_size)
        aligned = o3d.geometry.PointCloud(scan); aligned.transform(icp.transformation)
        elem = element_analysis_ifc(aligned, bim_path, tolerance_m) if bim_path.suffix.lower() == ".ifc" else []
        rmse, fitness = float(icp.inlier_rmse), float(icp.fitness)
        conf = registration_confidence(fitness, rmse, voxel_size)
        verified = sum(1 for x in elem if x["status"] == "VERIFIED"); review = len(elem) - verified
        total_w = sum(float(x.get("weight", 1.0)) for x in elem)
        verified_w = sum(float(x.get("weight", 1.0)) for x in elem if x["status"] == "VERIFIED")
        field_progress = round(verified_w / max(total_w, 1e-9) * 100.0, 2) if elem else None
        bim_progress = extract_bim_progress(bim_path) if bim_path.suffix.lower() == ".ifc" else {"available": False, "reason": "BIM progress extraction requires IFC."}
        payload = {
            "analysisId": job_id, "projectId": project_id, "status": "completed", "createdAt": now(),
            "engine": {"registration": "FPFH + RANSAC + Point-to-Plane ICP", "geometry": "Open3D", "bim": "IFC via IfcOpenShell"},
            "input": {"scanFile": point_cloud.filename, "bimFile": bim.filename, "pointCount": len(scan.points), "voxelSizeM": voxel_size, "toleranceM": tolerance_m},
            "registration": {"fitness": round(fitness, 5), "rmseM": round(rmse, 5), "confidencePct": round(conf * 100, 1), "transformation": np.asarray(icp.transformation).round(8).tolist()},
            "elementResults": elem[:10000],
            "bimProgress": bim_progress,
            "summary": {"elementsAnalyzed": len(elem), "verified": verified, "review": review, "verificationPct": round((verified / len(elem)) * 100, 1) if elem else None, "fieldVerifiedProgressPct": field_progress},
            "limitations": ["التحقق العنصري يقيس قرب سطح BIM من نقاط المسح؛ الحجب/المناطق غير المرئية قد تخفض التغطية.", "BIM وحده لا يثبت الإنجاز الميداني إلا إذا حمل بيانات حالة/تقدم موثوقة.", "للمقارنة الزمنية العامة استخدم endpoint المقارنة بين مسحين أدناه."],
        }
        save_result(payload); return JSONResponse(payload)
    except Exception as e:
        JOBS[job_id] = {"status": "error", "error": str(e), "analysisId": job_id}
        raise HTTPException(500, str(e))


@app.post("/api/reality/compare-scans")
async def compare_scans(
    identity=Depends(require_roles("مدير عام","مالك الشركة","مدير المشروع","مدير PMO")),
    scan_before: UploadFile = File(...), scan_after: UploadFile = File(...), project_id: str = Form(""),
    before_date: str = Form(""), after_date: str = Form(""), voxel_size: float = Form(0.05), tolerance_m: float = Form(0.025),
    expected_scope_volume_m3: float = Form(0),
    before_reference_measured_m: float = Form(0), before_reference_true_m: float = Form(0),
    after_reference_measured_m: float = Form(0), after_reference_true_m: float = Form(0),
):
    if voxel_size <= 0 or tolerance_m <= 0:
        raise HTTPException(400, "voxel_size و tolerance_m يجب أن يكونا أكبر من صفر.")
    job_id = str(uuid.uuid4()); JOBS[job_id] = {"status": "processing", "createdAt": now(), "projectId": project_id}
    try:
        before_path = save_upload(scan_before, job_id, "before"); after_path = save_upload(scan_after, job_id, "after")
        before = load_point_cloud(before_path); after = load_point_cloud(after_path)
        calibration = {"enabled": False, "before": None, "after": None, "warning": None}
        if before_reference_measured_m > 0 or before_reference_true_m > 0:
            if before_reference_measured_m <= 0 or before_reference_true_m <= 0:
                raise HTTPException(400, "بيانات مرجع المسح الأول غير مكتملة.")
            before, bf = apply_scale_correction(before, before_reference_measured_m, before_reference_true_m)
            err, level = calibration_quality(bf)
            calibration["before"] = {"measuredM": before_reference_measured_m, "trueM": before_reference_true_m, "scaleFactor": round(bf, 8), "scaleErrorPct": err, "quality": level}
            calibration["enabled"] = True
        if after_reference_measured_m > 0 or after_reference_true_m > 0:
            if after_reference_measured_m <= 0 or after_reference_true_m <= 0:
                raise HTTPException(400, "بيانات مرجع المسح الثاني غير مكتملة.")
            after, af = apply_scale_correction(after, after_reference_measured_m, after_reference_true_m)
            err, level = calibration_quality(af)
            calibration["after"] = {"measuredM": after_reference_measured_m, "trueM": after_reference_true_m, "scaleFactor": round(af, 8), "scaleErrorPct": err, "quality": level}
            calibration["enabled"] = True
        if calibration["enabled"] and any(x and x["quality"] == "poor" for x in [calibration["before"], calibration["after"]]):
            calibration["warning"] = "خطأ المقياس أكبر من 3%. اطلب قياس مرجع إضافي أو استخدم نقاط تحكم مساحية قبل اعتماد التقرير."
        # Align AFTER into BEFORE coordinate system. This makes the change report robust to small placement/orientation differences.
        icp, ransac = register_clouds(after, before, voxel_size)
        aligned_after = o3d.geometry.PointCloud(after); aligned_after.transform(icp.transformation)
        d_before_to_after = nearest_distances(np.asarray(before.points), aligned_after)
        d_after_to_before = nearest_distances(np.asarray(aligned_after.points), before)
        stats_before = distance_stats(d_before_to_after, tolerance_m)
        stats_after = distance_stats(d_after_to_before, tolerance_m)
        changes = voxel_change_metrics(before, aligned_after, voxel_size)
        conf = registration_confidence(float(icp.fitness), float(icp.inlier_rmse), voxel_size)
        progress = None
        progress_method = None
        if expected_scope_volume_m3 > 0:
            # This is an explicit project-scope denominator, not an invented AI percentage.
            progress = round(min(100.0, max(0.0, changes["addedVolumeM3"] / expected_scope_volume_m3 * 100.0)), 2)
            progress_method = "added_voxel_volume / explicit expected_scope_volume_m3"
        payload = {
            "analysisId": job_id, "projectId": project_id, "status": "completed", "createdAt": now(),
            "type": "scan-to-scan-progress",
            "dates": {"before": before_date or None, "after": after_date or None},
            "engine": {"registration": "FPFH + RANSAC + Point-to-Plane ICP", "changeDetection": "voxel occupancy + symmetric nearest-neighbour distances"},
            "input": {"beforeFile": scan_before.filename, "afterFile": scan_after.filename, "beforePoints": len(before.points), "afterPoints": len(after.points), "voxelSizeM": voxel_size, "toleranceM": tolerance_m},
            "registration": {"fitness": round(float(icp.fitness), 5), "rmseM": round(float(icp.inlier_rmse), 5), "confidencePct": round(conf * 100, 1), "transformation": np.asarray(icp.transformation).round(8).tolist()},
            "calibration": calibration,
            "comparison": {"beforeToAfter": stats_before, "afterToBefore": stats_after, "change": changes},
            "progress": {"progressPct": progress, "method": progress_method, "note": "لا يمكن اشتقاق نسبة إنجاز مشروع عامة من مسحين فقط دون تعريف نطاق/هدف هندسي. عند إدخال expected_scope_volume_m3 تصبح النسبة حجمية صريحة وقابلة للتدقيق."},
            "report": {"headline": f"تغير مكاني {changes['changeRatePct']}% — زيادة إشغال {changes['occupancyIncreasePct']}% — حجم تغيّر إجمالي تقريبي {changes['grossChangedVolumeM3']} م³", "confidencePct": round(conf * 100, 1)},
            "limitations": ["تصحيح المرجع أحادي القياس يصحح scale bias فقط ولا يعوض عن نقاط التحكم المساحية أو أخطاء drift المحلية.", "الـvoxel change metric يقيس تغير الإشغال المكاني وليس كمية العمل المنفذة لكل نشاط.", "للمشاريع متعددة الأنشطة يجب ربط عناصر BIM بالمهام/الأوزان للحصول على progress موزون.", "المناطق المحجوبة أو اختلاف ظروف المسح قد تظهر كتغيرات؛ يجب مراجعة registration confidence والتغطية."],
        }
        save_result(payload); return JSONResponse(payload)
    except Exception as e:
        JOBS[job_id] = {"status": "error", "error": str(e), "analysisId": job_id}
        raise HTTPException(500, str(e))





CONTROL_NETWORKS = DATA / "control_networks.json"

def load_control_networks():
    try:
        return json.loads(CONTROL_NETWORKS.read_text(encoding="utf-8")) if CONTROL_NETWORKS.exists() else {}
    except Exception:
        return {}

def save_control_networks(data):
    CONTROL_NETWORKS.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

def validate_control_definition(points):
    if not isinstance(points, list) or len(points) < 3:
        raise ValueError("يلزم 3 نقاط تحكم على الأقل.")
    ids=[]; xyz=[]
    for p in points:
        pid=str(p.get("id") or p.get("name") or "").strip()
        real=np.asarray(p.get("real"), dtype=float)
        if not pid or real.shape != (3,) or not np.isfinite(real).all():
            raise ValueError("كل نقطة يجب أن تحتوي id و real=[X,Y,Z].")
        if pid in ids: raise ValueError(f"معرّف مكرر: {pid}")
        ids.append(pid); xyz.append(real)
    xyz=np.asarray(xyz)
    if np.linalg.matrix_rank(xyz-xyz.mean(axis=0)) < 2:
        raise ValueError("نقاط التحكم الحقيقية غير موزعة هندسياً بشكل كافٍ؛ تجنب وضعها على خط واحد.")
    return ids, xyz

@app.get("/api/reality/control-networks")
async def list_control_networks(project_id: str = ""):
    data=load_control_networks()
    items=list(data.values())
    if project_id: items=[x for x in items if x.get("projectId")==project_id]
    return {"status":"ok","items":items}

@app.post("/api/reality/control-networks")
async def create_control_network(payload: dict, identity=Depends(require_roles("مدير عام","مالك الشركة","مدير المشروع","مدير PMO"))):
    network_id=str(payload.get("id") or uuid.uuid4())
    points=payload.get("points") or []
    ids, xyz=validate_control_definition(points)
    data=load_control_networks()
    item={"id":network_id,"name":str(payload.get("name") or network_id),"projectId":str(payload.get("projectId") or ""),
          "coordinateSystem":str(payload.get("coordinateSystem") or "Local XYZ"),"points":points,"recommended":len(points)>=4,"updatedAt":now()}
    data[network_id]=item; save_control_networks(data)
    return {"status":"created","network":item}

@app.get("/api/reality/control-networks/{network_id}")
async def get_control_network(network_id: str):
    item=load_control_networks().get(network_id)
    if not item: raise HTTPException(404,"شبكة التحكم غير موجودة.")
    return item

@app.post("/api/reality/control-points/align")
async def align_with_control_points(
    identity=Depends(require_roles("مدير عام","مالك الشركة","مدير المشروع","مدير PMO")),
    point_cloud: UploadFile = File(...),
    control_points_json: str = Form(...),
    project_id: str = Form("")
):
    """Survey-grade-ish field correction using at least 3 corresponding 3D control points.
    It estimates a 7-parameter similarity transform (rotation, translation, scale),
    reports residuals, and writes a corrected PLY. It is not a substitute for a
    surveyed control network/Total Station when contractual accuracy is required.
    """
    job_id = str(uuid.uuid4())
    try:
        points = json.loads(control_points_json)
        if not isinstance(points, list) or len(points) < 3:
            raise ValueError("أدخل 3 نقاط تحكم على الأقل.")
        src=[]; dst=[]; ids=[]
        for i, p in enumerate(points, 1):
            a=np.asarray(p.get("scan"), dtype=float); b=np.asarray(p.get("real"), dtype=float)
            if a.shape != (3,) or b.shape != (3,) or not np.isfinite(a).all() or not np.isfinite(b).all():
                raise ValueError(f"نقطة التحكم {i} غير صالحة؛ المطلوب [X,Y,Z].")
            src.append(a); dst.append(b); ids.append(str(p.get("id") or p.get("name") or f"CP-{i}"))
        src=np.asarray(src); dst=np.asarray(dst)
        if np.linalg.matrix_rank(src-src.mean(axis=0)) < 2:
            raise ValueError("نقاط التحكم غير موزعة هندسياً بشكل كافٍ؛ استخدم نقاطاً غير متطابقة/غير خطية مكانياً.")
        path=save_upload(point_cloud, job_id, "scan")
        pcd=load_point_cloud(path)
        scale,R,t,res=umeyama_similarity(src,dst,True)
        corrected=transform_cloud(pcd,scale,R,t)
        out_path=UPLOADS/job_id/"corrected_scan.ply"
        o3d.io.write_point_cloud(str(out_path), corrected, write_ascii=False)
        mean=float(np.mean(res)); p95=float(np.percentile(res,95)); mx=float(np.max(res))
        quality="excellent" if p95 <= 0.01 else "good" if p95 <= 0.025 else "review" if p95 <= 0.05 else "poor"
        result={"analysisId":job_id,"status":"completed","type":"control-point-alignment","projectId":project_id,
          "controlPoints":len(points),"controlPointIds":ids,"transform":{"scale":round(float(scale),10),"rotationMatrix":np.round(R,8).tolist(),"translationM":np.round(t,6).tolist()},
          "residuals":{"meanM":round(mean,5),"p95M":round(p95,5),"maxM":round(mx,5),"individualM":[round(float(x),5) for x in res]},
          "quality":quality,"correctedFile":f"/api/reality/jobs/{job_id}/corrected-scan.ply",
          "recommendation":("اعتمد التصحيح للاستخدام في التحليل المكتبي، مع بقاء المراجعة المساحية للمشاريع الحرجة." if quality in {"excellent","good"} else "أعد المسح أو أضف نقاط تحكم موزعة على كامل المنطقة؛ لا تعتمد نتيجة التقدم قبل حل الخطأ."),
          "note":"تم تطبيق 3D similarity transform. نقاط التحكم تصحح translation/rotation/scale لكنها لا تعالج أخطاء محلية أو drift بين النقاط."}
        JOBS[job_id]=result
        return JSONResponse(result)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/reality/jobs/{job_id}/corrected-scan.ply")
async def download_corrected_scan(job_id: str):
    from fastapi.responses import FileResponse
    path=UPLOADS/job_id/"corrected_scan.ply"
    if not path.exists(): raise HTTPException(status_code=404, detail="الملف المصحح غير موجود.")
    return FileResponse(path, media_type="application/octet-stream", filename=f"corrected_scan_{job_id[:8]}.ply")

@app.post("/api/reality/calibrate")
async def calibrate_scan(point_cloud: UploadFile = File(...), measured_m: float = Form(...), true_m: float = Form(...)):
    """Validate a phone/LiDAR scan against one known physical dimension.
    The endpoint returns the scale correction and warns when the mismatch is too large.
    """
    if measured_m <= 0 or true_m <= 0:
        raise HTTPException(400, "القياسان يجب أن يكونا أكبر من صفر.")
    job_id = str(uuid.uuid4())
    try:
        path = save_upload(point_cloud, job_id, "scan")
        scan = load_point_cloud(path)
        corrected, factor = apply_scale_correction(scan, measured_m, true_m)
        err, level = calibration_quality(factor)
        payload = {
            "analysisId": job_id, "status": "completed", "type": "scan-calibration", "createdAt": now(),
            "input": {"file": point_cloud.filename, "pointCount": len(scan.points)},
            "calibration": {"measuredM": measured_m, "trueM": true_m, "scaleFactor": round(factor, 8), "scaleErrorPct": err, "quality": level},
            "recommendation": "اعتمد التصحيح" if level in {"excellent", "good"} else "اطلب مرجعاً إضافياً/نقاط تحكم قبل اعتماد المسح",
            "note": "هذا اختبار وتصحيح للمقياس فقط؛ لا يعتبر بديلاً عن Total Station/GNSS/Control Points عند الحاجة إلى دقة مساحية."
        }
        save_result(payload); return JSONResponse(payload)
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/api/reality/bim-progress")
async def bim_progress(bim: UploadFile = File(...), project_id: str = Form("")):
    job_id = str(uuid.uuid4())
    try:
        path = save_upload(bim, job_id, "bim")
        result = extract_bim_progress(path)
        payload = {"analysisId": job_id, "projectId": project_id, "status": "completed", "createdAt": now(), "type": "bim-progress", **result}
        save_result(payload); return JSONResponse(payload)
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/api/reality/jobs/{job_id}")
def get_job(job_id: str):
    p = DATA / f"{job_id}.json"
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    if job_id in JOBS:
        return JOBS[job_id]
    raise HTTPException(404, "Analysis not found")

# ---------------- APEX Enterprise Intelligence ----------------
from itertools import combinations

@app.get('/api/apex/health')
async def apex_health(identity=Depends(require_permission('apex.commander'))):
    return {'status':'ok','engine':'Reality Engine APEX','version':'6.0.0','capabilities':[
        'portfolio-health','predictive-forecast','robust-control-alignment','independent-check-point',
        'audit-ready-governance','digital-twin-readiness','ai-risk-triage']}

def robust_similarity(src, dst, threshold=0.03):
    src=np.asarray(src,float); dst=np.asarray(dst,float)
    if len(src)<3 or src.shape!=dst.shape or src.shape[1]!=3:
        raise ValueError('يلزم 3 نقاط على الأقل وبأبعاد XYZ.')
    candidates=[]
    for idx in combinations(range(len(src)),3):
        try:
            s,R,t,res=umeyama_similarity(src[list(idx)],dst[list(idx)],True)
            pred=(s*(R@src.T)).T+t
            errs=np.linalg.norm(pred-dst,axis=1)
            inliers=errs<=threshold
            score=(int(inliers.sum()), float(np.median(errs[inliers])) if inliers.any() else 1e9, float(errs.mean()))
            candidates.append((score,s,R,t,errs,inliers))
        except Exception:
            continue
    if not candidates: raise ValueError('تعذر حساب تحويل متين.')
    candidates.sort(key=lambda x:(-x[0][0],x[0][1],x[0][2]))
    _,s0,R0,t0,errs0,inliers0=candidates[0]
    if inliers0.sum()>=3:
        s,R,t,res=umeyama_similarity(src[inliers0],dst[inliers0],True)
        pred=(s*(R@src.T)).T+t
        errs=np.linalg.norm(pred-dst,axis=1)
    else:
        s,R,t,res=s0,R0,t0,errs0
    return s,R,t,errs,(errs<=threshold)

@app.post('/api/reality/control-points/robust-align')
async def robust_control_alignment(point_cloud: UploadFile = File(...), control_points_json: str = Form(...),
                                    threshold_m: float = Form(0.03), check_point_ids: str = Form(''),
                                    identity=Depends(require_roles('مدير عام','مالك الشركة','مدير المشروع','مدير PMO'))):
    """Robust similarity registration. Uses minimal 3-point hypotheses to reject bad observations,
    then refits on inliers. Optional check_point_ids are never used to estimate the transform."""
    try:
        points=json.loads(control_points_json)
        if len(points)<4:
            raise ValueError('الوضع المتين يوصى له بـ4 نقاط على الأقل: 3 للمعايرة وواحدة للتحقق.')
        src=[]; dst=[]; ids=[]
        checks={x.strip() for x in check_point_ids.split(',') if x.strip()}
        for p in points:
            pid=str(p.get('id') or p.get('name') or '').strip()
            a=np.asarray(p.get('scan'),float); b=np.asarray(p.get('real'),float)
            if a.shape!=(3,) or b.shape!=(3,) or not np.isfinite(a).all() or not np.isfinite(b).all():
                raise ValueError(f'Control point {pid or "?"} غير صالح.')
            ids.append(pid); src.append(a); dst.append(b)
        src=np.asarray(src); dst=np.asarray(dst)
        fit_idx=[i for i,pid in enumerate(ids) if pid not in checks]
        check_idx=[i for i,pid in enumerate(ids) if pid in checks]
        if len(fit_idx)<3: raise ValueError('يلزم 3 نقاط معايرة على الأقل بعد استبعاد نقاط التحقق.')
        s,R,t,errs,inliers=robust_similarity(src[fit_idx],dst[fit_idx],max(float(threshold_m),0.001))
        corrected_errors=np.full(len(ids),np.nan)
        pred=(s*(R@src.T)).T+t
        corrected_errors=np.linalg.norm(pred-dst,axis=1)
        fit_errors=corrected_errors[fit_idx]
        check_errors=corrected_errors[check_idx] if check_idx else np.array([])
        quality='excellent' if np.percentile(fit_errors,95)<=0.01 else 'good' if np.percentile(fit_errors,95)<=0.025 else 'review' if np.percentile(fit_errors,95)<=0.05 else 'poor'
        job_id=str(uuid.uuid4()); path=save_upload(point_cloud,job_id,'scan'); pcd=load_point_cloud(path)
        corrected=transform_cloud(pcd,s,R,t); out=UPLOADS/job_id/'corrected_scan.ply'; o3d.io.write_point_cloud(str(out),corrected,write_ascii=False)
        payload={'analysisId':job_id,'status':'completed','type':'robust-control-point-alignment','createdAt':now(),
          'controlPoints':len(ids),'inliers':int(np.sum(inliers)),'rejectedObservationIds':[ids[fit_idx[j]] for j,v in enumerate(inliers) if not v],
          'transform':{'scale':float(s),'rotationMatrix':np.asarray(R).round(10).tolist(),'translationM':np.asarray(t).round(8).tolist()},
          'fitResidualsM':{ 'mean':float(np.mean(fit_errors)),'p95':float(np.percentile(fit_errors,95)),'max':float(np.max(fit_errors))},
          'checkPoints':[{ 'id':ids[i],'errorM':float(corrected_errors[i]),'pass':bool(corrected_errors[i]<=threshold_m)} for i in check_idx],
          'quality':quality,'correctedFile':f'/api/reality/jobs/{job_id}/corrected-scan.ply',
          'recommendation':'اعتمد فقط إذا اجتازت نقاط التحقق المستقلة حدود المشروع.' if check_idx else 'أضف نقطة تحقق مستقلة قبل الاعتماد النهائي.'}
        JOBS[job_id]=payload; return JSONResponse(payload)
    except Exception as e: raise HTTPException(400,str(e))

@app.post('/api/apex/forecast')
async def apex_forecast(payload: dict, identity=Depends(require_permission('apex.forecast'))):
    """Lightweight Monte-Carlo schedule forecast. Inputs: remaining_days, uncertainty_pct, iterations."""
    try:
        remaining=max(float(payload.get('remaining_days',1)),0.1); uncertainty=max(float(payload.get('uncertainty_pct',20)),0)/100
        iterations=min(max(int(payload.get('iterations',10000)),1000),50000)
        rng=np.random.default_rng(42)
        samples=rng.lognormal(mean=math.log(remaining)-0.5*math.log(1+uncertainty**2),sigma=math.sqrt(math.log(1+uncertainty**2)),size=iterations)
        return {'status':'ok','iterations':iterations,'P50Days':round(float(np.percentile(samples,50)),1),'P80Days':round(float(np.percentile(samples,80)),1),'P90Days':round(float(np.percentile(samples,90)),1),'meanDays':round(float(samples.mean()),1),'method':'lognormal Monte Carlo','note':'Forecast إحصائي مساعد؛ لا يستبدل تحديث الجدول الفعلي وتحليل المسار الحرج.'}
    except Exception as e: raise HTTPException(400,str(e))

@app.post('/api/apex/ai/triage')
async def apex_ai_triage(payload: dict, identity=Depends(require_permission('apex.ai'))):
    """Explainable rule-based triage endpoint; suitable as a safe fallback before connecting an LLM."""
    signals=payload.get('signals') or {}
    actions=[]
    if float(signals.get('spi',1))<0.9: actions.append({'priority':'critical','action':'تحليل المسار الحرج وإعادة تسلسل الاعتماديات','reason':'SPI أقل من 0.90'})
    if float(signals.get('cpi',1))<0.9: actions.append({'priority':'critical','action':'مراجعة التكلفة والتوقع النهائي EAC','reason':'CPI أقل من 0.90'})
    if float(signals.get('riskScore',0))>=75: actions.append({'priority':'high','action':'فتح جلسة Risk Response','reason':'درجة الخطر مرتفعة'})
    if float(signals.get('overdue',0))>0: actions.append({'priority':'high','action':'تعيين مالك لكل مهمة متأخرة مع موعد تعافٍ','reason':'وجود مهام متأخرة'})
    if not actions: actions.append({'priority':'normal','action':'استمرار المراقبة الأسبوعية','reason':'لا توجد إشارة حرجة في المدخلات'})
    return {'status':'ok','explainable':True,'actions':actions,'framework':'NIST AI RMF — Govern / Map / Measure / Manage'}
