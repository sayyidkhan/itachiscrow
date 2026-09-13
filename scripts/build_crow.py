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
        for group in parts.values():
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
