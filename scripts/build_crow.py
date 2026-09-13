"""Build the articulated crow in X-right, Y-forward, Z-up author space.

The shared Maps-space root preserves native heading, pitch and wing roll.
"""
from pathlib import Path
import numpy as np
import trimesh as tm
from scipy.interpolate import PchipInterpolator
from trimesh.visual.material import PBRMaterial

OUT = Path(__file__).resolve().parents[1] / 'dist/models'
OUT.mkdir(parents=True, exist_ok=True)
materials = [PBRMaterial(name=name, baseColorFactor=color, metallicFactor=metal,
                         roughnessFactor=rough, doubleSided=False)
             for name, color, metal, rough in [
                 ('Satin black plumage', [18, 22, 28, 255], .08, .48),
                 ('Indigo flight feathers', [23, 29, 38, 255], .16, .38),
                 ('Graphite coverts', [28, 34, 43, 255], .12, .43),
                 ('Polished horn', [10, 12, 16, 255], .04, .28),
                 ('Deep crimson iris', [125, 12, 19, 255], .05, .22),
                 ('Obsidian eyes', [3, 4, 6, 255], .0, .12),
                 ('Feather shafts', [32, 38, 46, 255], .08, .5)]]
parts = {'body': [], 'left-wing': [], 'right-wing': []}


def add(part, mesh, mat=0):
    if part == 'perched':
        mesh.update_faces(mesh.nondegenerate_faces(height=1e-7))
        mesh.remove_unreferenced_vertices()
    mesh.fix_normals()
    mesh.visual = tm.visual.TextureVisuals(material=materials[mat])
    parts[part].append(mesh)


def skin(part, rings, mat=0):
    rings = np.asarray(rings)
    count, sides, _ = rings.shape
    vertices = list(rings.reshape(-1, 3))
    faces = []
    for i in range(count - 1):
        for j in range(sides):
            a = i * sides + j
            b = i * sides + (j + 1) % sides
            faces.extend([[a, b, b + sides], [a, b + sides, a + sides]])
    vertices.extend([rings[0].mean(axis=0), rings[-1].mean(axis=0)])
    for j in range(sides):
        k = (count - 1) * sides
        faces.extend([[count * sides, (j + 1) % sides, j],
                      [count * sides + 1, k + j, k + (j + 1) % sides]])
    add(part, tm.Trimesh(vertices=vertices, faces=faces, process=True), mat)


def ellipsoid(part, center, scale, mat=0):
    mesh = tm.creation.icosphere(subdivisions=3)
    mesh.vertices = mesh.vertices * scale + center
    add(part, mesh, mat)


def longitudinal(part, stations, mat=0, samples=44, sides=24):
    stations = np.asarray(stations)
    ys = np.linspace(stations[0, 0], stations[-1, 0], samples)
    values = PchipInterpolator(stations[:, 0], stations[:, 1:])(ys)
    theta = np.linspace(0, 2 * np.pi, sides, endpoint=False)
    rings = [[[width * np.cos(a), y, z + height * np.sin(a)]
              for a in theta] for y, (width, height, z) in zip(ys, values)]
    skin(part, rings, mat)


def feather(part, start, end, width, mat=1, thickness=.012, bend=.04,
            shaft=False, asymmetry=.22):
    a, b = np.array(start, dtype=float), np.array(end, dtype=float)
    axis = b - a
    side = np.cross(axis, [0, 0, 1.])
    side /= np.linalg.norm(side)
    profile = PchipInterpolator([0, .14, .4, .68, .86, .96, 1],
                                [.12, .65, 1, .96, .75, .38, .015])
    rings, centres = [], []
    for t in np.linspace(0, 1, 13):
        centre = a + axis * t + side * bend * t * t
        centre[2] += .028 * np.sin(np.pi * t) - .035 * t * t
        centres.append(centre)
        ring = []
        for theta in np.linspace(0, 2 * np.pi, 8, endpoint=False):
            lateral = np.cos(theta)
            w = width * profile(t) * (1 + asymmetry * np.sign(lateral))
            ring.append(centre + side * w * lateral
                        + [0, 0, thickness * np.sin(theta) * (.2 + .8 * profile(t))])
        rings.append(ring)
    skin(part, rings, mat)
    if shaft:
        spine = []
        for t, centre in zip(np.linspace(0, 1, 13), centres):
            radius = .0045 * (1 - .85 * t)
            spine.append([centre + side * radius * np.cos(theta)
                          + [0, 0, thickness + radius * np.sin(theta)]
                          for theta in np.linspace(0, 2 * np.pi, 4, endpoint=False)])
        skin(part, spine, 6)


longitudinal('body', [
    [-.89, .025, .035, -.045], [-.65, .16, .13, -.025],
    [-.36, .25, .22, .0], [-.02, .29, .255, .025],
    [.25, .245, .225, .07], [.46, .168, .172, .14],
    [.62, .183, .183, .225], [.79, .208, .20, .255],
    [.94, .152, .14, .235], [1.035, .05, .045, .20]])
longitudinal('body', [
    [.92, .105, .075, .20], [1.03, .094, .067, .195],
    [1.17, .065, .05, .178], [1.32, .026, .024, .145],
    [1.39, .002, .003, .12]], 3, samples=18, sides=16)
longitudinal('body', [
    [.955, .085, .022, .137], [1.10, .067, .02, .13],
    [1.28, .022, .014, .117], [1.34, .002, .002, .112]], 0, samples=12, sides=12)

for sign in [-1, 1]:
    ellipsoid('body', [sign * .183, .845, .285], [.031, .047, .039], 3)
    ellipsoid('body', [sign * .209, .851, .289], [.012, .024, .025], 4)
    ellipsoid('body', [sign * .219, .856, .291], [.006, .013, .017], 5)
    feather('body', [sign * .137, .90, .319], [sign * .198, .753, .34],
            .037, 0, thickness=.013, bend=0)
    for row in range(4):
        for col in range(3):
            x = sign * (.055 + col * .067)
            y = .29 - row * .16
            z = .29 - col * .027 - row * .017
            feather('body', [x, y, z], [x * .78, y - .32, z - .055],
                    .054, 0 if col < 2 else 1, thickness=.009, bend=0)
    for i in range(3):
        feather('body', [sign * (.12 + i * .03), .55, .11 - i * .015],
                [sign * (.14 + i * .03), .27, -.085 - i * .02],
                .04, 0, bend=0)
    feather('body', [sign * .12, -.29, -.19], [sign * .13, -.61, -.21],
            .033, 3, thickness=.022, bend=0)
    for i in range(3):
        feather('body', [sign * .13, -.55, -.235],
                [sign * .13 + (i - 1) * .033, -.74, -.22],
                .009, 3, thickness=.009, bend=0)

for i in range(12):
    u = (i - 5.5) / 5.5
    feather('body', [u * .105, -.60, -.045],
            [u * .32, -1.37 + .08 * abs(u) ** 2, -.10 + .015 * abs(u)],
            .067, 1, bend=-u * .013, shaft=True, asymmetry=0)
for i in range(5):
    feather('body', [(i - 2) * .048, -.50, .088],
            [(i - 2) * .055, -.94, .022], .048, 0, bend=0)

for sign, part in [(-1, 'left-wing'), (1, 'right-wing')]:
    stations = np.array([
        [.17, .035, .22, .105, .025], [.40, .105, .30, .095, .04],
        [.77, .13, .32, .080, .055], [1.10, .075, .275, .063, .025],
        [1.42, -.015, .22, .047, .005], [1.72, -.08, .13, .025, -.008],
        [1.95, -.14, .025, .006, -.018]])
    xs = np.linspace(stations[0, 0], stations[-1, 0], 28)
    values = PchipInterpolator(stations[:, 0], stations[:, 1:])(xs)
    rings = [[[sign * x, y + chord * np.cos(a), z + height * np.sin(a)]
              for a in np.linspace(0, 2 * np.pi, 16, endpoint=False)]
             for x, (y, chord, height, z) in zip(xs, values)]
    skin(part, rings, 0)

    for i in range(13):
        t = i / 12
        x = .30 + 1.10 * t
        y = .13 - .12 * t
        feather(part, [sign * x, y, .015],
                [sign * (x + .14 + .11 * t), -.64 - .23 * np.sin(t * np.pi / 2), -.035],
                .105 - .007 * t, 1, bend=sign * .026, shaft=True)

    tips = [(2.58, .09), (2.70, -.19), (2.65, -.48), (2.49, -.77),
            (2.25, -1.00), (1.99, -1.10), (1.75, -1.06)]
    for i in reversed(range(len(tips))):
        x, y = tips[i]
        feather(part, [sign * (1.54 - .045 * i), .025 - .033 * i, .003 - .002 * i],
                [sign * x, y, -.065 - i * .006], .086 + .007 * i, 1,
                thickness=.013, bend=sign * .035, shaft=True)

    for row in range(3):
        for i in range(15):
            t = i / 14
            x = .24 + 1.37 * t
            lead = float(PchipInterpolator(stations[:, 0], stations[:, 1] + stations[:, 2])(x))
            y = lead - .05 - row * .17
            z = .111 - .055 * t - .018 * row
            feather(part, [sign * x, y, z],
                    [sign * (x + .09), y - .27 - .045 * row, z - .025],
                    .065 + row * .01, 2 if row == 1 else 0,
                    thickness=.008, bend=sign * .016)
    for i in range(3):
        feather(part, [sign * (1.12 + .08 * i), .23 - .035 * i, .04],
                [sign * (1.43 + .065 * i), .21 - .095 * i, .012],
                .048, 0, bend=sign * .015)

parts['perched'] = []
perch_stations = np.array([
    [.38, .012, .02, -.12], [.55, .19, .24, -.12], [.80, .30, .34, -.10],
    [1.05, .34, .39, -.06], [1.30, .30, .35, .01], [1.53, .25, .285, .09],
    [1.73, .25, .278, .145], [1.88, .258, .295, .16],
    [2.03, .212, .255, .15], [2.13, .115, .145, .14], [2.16, .001, .002, .14]])
perch_profile = PchipInterpolator(perch_stations[:, 0], perch_stations[:, 1:])


def contour_feather(start, end, normal, width, mat=0, depth=.006):
    a, b = np.array(start), np.array(end)
    axis = b - a
    axis /= np.linalg.norm(axis)
    normal = np.array(normal, dtype=float)
    normal -= axis * np.dot(normal, axis)
    normal /= np.linalg.norm(normal)
    side = np.cross(axis, normal)
    rings = []
    for t in np.linspace(0, 1, 8):
        profile = max(.012, np.sin(np.pi * t) ** .65)
        centre = a + (b - a) * t + normal * .004 * np.sin(np.pi * t)
        rings.append([centre + side * width * profile * np.cos(v)
                      + normal * depth * profile * np.sin(v)
                      for v in np.linspace(0, 2 * np.pi, 6, endpoint=False)])
    skin('perched', rings, mat)


def feather_coat(centre, radii, rows, columns, length, width, mat=0,
                 phi_range=(.18, 2.75)):
    centre, radii = np.array(centre), np.array(radii)
    for row, phi in enumerate(np.linspace(*phi_range, rows)):
        for col in range(columns):
            jitter = .22 * np.sin(row * 19.31 + col * 7.73)
            theta = 2 * np.pi * (col + (row % 2) * .5 + jitter) / columns
            rings = []
            angular_length = length * (1 + jitter) / np.linalg.norm(radii * [np.cos(phi), 0, np.sin(phi)])
            if phi + (1 + abs(jitter) * .3) * angular_length > 3.0:
                continue
            for t in np.linspace(0, 1, 8):
                p = phi + (t + jitter * .3) * angular_length
                profile = max(.01, (1 - t) ** .85 * min(1, t * 8))
                ring = []
                for v in np.linspace(0, 2 * np.pi, 6, endpoint=False):
                    angle = theta + (np.cos(v) * width * profile + jitter * t * .018) / max(.07, radii[0] * np.sin(p))
                    direction = np.array([np.sin(p) * np.cos(angle), np.sin(p) * np.sin(angle), np.cos(p)])
                    lift = .0012 + .0015 * np.sin(np.pi * t) + .0006 * np.sin(v) * profile
                    z = float(np.clip(centre[2] + radii[2] * direction[2], .381, 2.159))
                    rx, ry, cy = perch_profile(z)
                    ring.append([(rx + lift) * np.cos(angle), cy + (ry + lift) * np.sin(angle), z])
                rings.append(ring)
            skin('perched', rings, mat)


def tendon(points, radius, mat=3):
    points = np.array(points)
    rings = []
    for i, point in enumerate(points):
        axis = points[min(i + 1, len(points) - 1)] - points[max(0, i - 1)]
        axis /= np.linalg.norm(axis)
        side = np.cross(axis, [1., 0, 0])
        if np.linalg.norm(side) < .01:
            side = np.cross(axis, [0., 1, 0])
        side /= np.linalg.norm(side)
        up = np.cross(side, axis)
        r = radius * (1 - .75 * i / (len(points) - 1))
        rings.append([point + r * (side * np.cos(v) + up * np.sin(v))
                      for v in np.linspace(0, 2 * np.pi, 10, endpoint=False)])
    skin('perched', rings, mat)


skin('perched', [[(rx * np.cos(t), cy + ry * np.sin(t), z)
                 for t in np.linspace(0, 2 * np.pi, 48, endpoint=False)]
                for z in np.linspace(.38, 2.16, 90)
                for rx, ry, cy in [perch_profile(z)]])
feather_coat([0, -.06, 1.03], [.34, .39, .65], 15, 38, .23, .031)
feather_coat([0, .08, 1.52], [.255, .285, .40], 12, 32, .18, .022, phi_range=(.65, 2.6))
feather_coat([0, .16, 1.87], [.258, .30, .29], 16, 42, .075, .010)

longitudinal('perched', [
    [.35, .133, .085, 1.87], [.45, .122, .089, 1.87],
    [.60, .092, .067, 1.86], [.74, .055, .041, 1.837],
    [.83, .022, .025, 1.80], [.855, .005, .022, 1.765],
    [.86, .001, .003, 1.744]], 3, samples=28, sides=20)
longitudinal('perched', [
    [.36, .109, .028, 1.789], [.52, .09, .032, 1.784],
    [.69, .053, .024, 1.786], [.80, .002, .002, 1.79]], 3, samples=18)

for sign in [-1, 1]:
    ellipsoid('perched', [sign * .232, .288, 1.922], [.026, .061, .058], 3)
    ellipsoid('perched', [sign * .25, .294, 1.924], [.024, .044, .043], 5)
    ellipsoid('perched', [sign * .273, .300, 1.926], [.005, .025, .026], 4)
    ellipsoid('perched', [sign * .277, .303, 1.927], [.006, .018, .020], 5)
    ellipsoid('perched', [sign * .10, .458, 1.918], [.006, .028, .01], 5)
    contour_feather([sign * .195, .35, 1.976], [sign * .253, .22, 1.98],
                    [sign, 0, .7], .023)
    for i in range(6):
        contour_feather([sign * (.045 + i * .018), .395, 1.904 + i * .006],
                        [sign * (.039 + i * .011), .505, 1.882], [sign * .3, .3, 1], .012)
    for row in range(5):
        for col in range(9):
            t = col / 8
            y = .19 - t * .46 - row * .027
            z = 1.49 - row * .14 - t * .10
            x = sign * (.335 + .05 * np.sin(t * np.pi) - row * .009)
            contour_feather([x, y, z], [x * .94, y - .23, z - .30],
                            [sign, .2, .12], .053 if row < 2 else .062,
                            2 if row < 3 else 1, .004)
    for i in range(10):
        t = i / 9
        contour_feather([sign * (.355 - .013 * i), .10 - .028 * i, 1.15 - .027 * i],
                        [sign * (.23 - .011 * i), -.64 - .032 * i, .30 - .025 * i],
                        [sign, -.1, .25], .056, 1, .005)
    tendon([[sign * .16, .04, .57], [sign * .18, .02, .36], [sign * .18, .14, .13]], .036)
    for i in range(3):
        x = sign * .18 + (i - 1) * .072
        tendon([[sign * .18, .14, .13], [x, .26, .065],
                [x + (i - 1) * .025, .39, .04]], .022)
        tendon([[x + (i - 1) * .025, .39, .04], [x + (i - 1) * .03, .44, .025],
                [x + (i - 1) * .03, .46, -.005]], .014)
    tendon([[sign * .18, .12, .11], [sign * .22, -.02, .05], [sign * .23, -.10, .015]], .021)
    for i in range(6):
        ellipsoid('perched', [sign * .18, .115 - i * .013, .16 + i * .028], [.033 - i * .002, .015, .009], 2)

for i in range(12):
    u = (i - 5.5) / 5.5
    contour_feather([u * .14, -.28, .74],
                    [u * .24, -1.08 + abs(u) * .06, -.03 + abs(u) * .03],
                    [0, -.65, .76], .045, 1, .008)

conversion = np.array([[1, 0, 0, 0], [0, 0, 1, 0], [0, -1, 0, 0], [0, 0, 0, 1.]])
for name, meshes in parts.items():
    scene = tm.Scene()
    scene.graph.update(frame_to='maps-basis', matrix=np.linalg.inv(conversion))
    for index, material in enumerate(materials):
        group = [mesh for mesh in meshes if mesh.visual.material is material]
        if not group:
            continue
        mesh = tm.util.concatenate(group)
        mesh.visual = tm.visual.TextureVisuals(material=material)
        mesh.apply_transform(conversion)
        scene.add_geometry(mesh, geom_name=f'{name}-{index}', parent_node_name='maps-basis')
    data = scene.export(file_type='glb', include_normals=True)
    (OUT / f'{name}.glb').write_bytes(data)
    print(name, sum(len(mesh.faces) for mesh in meshes), 'triangles,', len(data), 'bytes')

if __name__ == '__main__':
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection
    fig = plt.figure(figsize=(16, 9), facecolor='#c3c9cd')
    for n, (elev, azim, title) in enumerate([
            (85, 90, 'DORSAL / WING SILHOUETTE'), (20, 35, 'HEAD / THREE-QUARTER'),
            (22, -75, 'FOLLOW CAMERA'), (4, 0, 'PROFILE')]):
        ax = fig.add_subplot(2, 2, n + 1, projection='3d', facecolor='#c3c9cd')
        for group in [parts[name] for name in ['body', 'left-wing', 'right-wing']]:
            for mesh in group:
                rgb = np.array(mesh.visual.material.baseColorFactor[:3]) / 255
                shade = .52 + .48 * np.maximum(0, mesh.face_normals @ np.array([.3, -.4, .866]))
                colors = np.clip(rgb[None, :] * shade[:, None] * 2.5, 0, 1)
                ax.add_collection3d(Poly3DCollection(mesh.triangles, facecolors=colors,
                                                   edgecolors='none', linewidths=0, antialiased=False))
        ax.set(xlim=(-2.85, 2.85), ylim=(-1.6, 1.6), zlim=(-.8, .8))
        ax.set_box_aspect((5.7, 3.2, 1.6))
        ax.view_init(elev=elev, azim=azim)
        ax.set_axis_off()
        ax.set_title(title, fontsize=11, color='#313e48', pad=-12)
    fig.tight_layout()
    preview = OUT.parent.parent / '_debug' / 'crow-geometry.png'
    preview.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(str(preview), dpi=150)
