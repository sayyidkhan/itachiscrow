"""Original articulated crow. Run with Python, numpy and trimesh.

Author coordinates: X right, Y forward, Z up. Export glTF Y-up meshes
under a Maps-space root so native heading/tilt/roll use east/north/up.
Three model parts share a shoulder pivot so Maps can animate them natively.
"""
from pathlib import Path
import numpy as np
import trimesh as tm
from trimesh.visual.material import PBRMaterial

OUT = Path(__file__).resolve().parents[1] / 'dist/models'
OUT.mkdir(parents=True, exist_ok=True)
materials = [PBRMaterial(name=name, baseColorFactor=color, metallicFactor=metal,
                         roughnessFactor=rough, doubleSided=True)
             for name, color, metal, rough in [
                 ('Obsidian plumage', [22, 28, 37, 255], .15, .45),
                 ('Blue black feathers', [32, 43, 57, 255], .22, .4),
                 ('Feather edge', [43, 51, 65, 255], .16, .48),
                 ('Beak and talons', [13, 16, 21, 255], .05, .3),
                 ('Crimson iris', [188, 27, 34, 255], .1, .24),
                 ('Eye glint', [230, 222, 210, 255], .0, .2)]]
parts = {'body': [], 'left-wing': [], 'right-wing': []}

def add(part, mesh, mat=0):
    mesh.visual = tm.visual.TextureVisuals(material=materials[mat])
    parts[part].append(mesh)

def ellipsoid(part, center, scale, mat=0):
    m = tm.creation.icosphere(subdivisions=2)
    m.vertices = m.vertices * scale + center
    add(part, m, mat)

def feather(part, start, end, width, mat=1, thickness=.025):
    # Closed, cambered feather with a tapering asymmetric vane and rounded tip.
    a, b = np.array(start), np.array(end)
    axis = b-a
    side = np.cross(axis, [0,0,1.])
    side /= np.linalg.norm(side)
    verts=[]
    rings=10
    for i in range(rings):
        t=i/(rings-1)
        w=width*(.08+.92*np.sin(np.pi*t)**.65)
        mid=a+axis*t+np.array([0,0,.04*np.sin(np.pi*t)])
        for j in range(8):
            r=j*np.pi/4
            verts.append(mid+side*w*np.cos(r)+[0,0,thickness*np.sin(r)*(.2+.8*np.sin(np.pi*t))])
    faces=[]
    for i in range(rings-1):
        for j in range(8):
            p=i*8+j;q=i*8+(j+1)%8
            faces.extend([[p,q,q+8],[p,q+8,p+8]])
    faces.extend([[0,j+1,j] for j in range(1,7)])
    k=(rings-1)*8
    faces.extend([[k,k+j,k+j+1] for j in range(1,7)])
    m=tm.Trimesh(vertices=verts, faces=faces, process=True)
    m.fix_normals()
    add(part,m,mat)

ellipsoid('body',[0,-.13,0],[.33,.73,.30])
ellipsoid('body',[0,.42,.10],[.24,.40,.24])
ellipsoid('body',[0,.77,.20],[.245,.30,.245])
# Long, gently hooked corvid beak, modelled as solid geometry.
feather('body',[0,.94,.17],[0,1.40,.08],.125,3,.09)
for sign in [-1,1]:
    ellipsoid('body',[sign*.218,.83,.26],[.035,.065,.060],3)
    ellipsoid('body',[sign*.244,.845,.268],[.015,.033,.034],4)
    ellipsoid('body',[sign*.253,.858,.283],[.007,.009,.009],5)
    # Folded feet tucked against the abdomen.
    feather('body',[sign*.15,-.35,-.22],[sign*.15,-.77,-.28],.042,3,.035)
    for j in [-1,0,1]:
        feather('body',[sign*.15,-.67,-.27],[sign*.15+j*.045,-.88,-.29],.012,3,.012)
# Layered mantle plumage.
for row in range(3):
    for j in range(-2,3):
        x=j*.092
        feather('body',[x,.32-row*.19,.26-abs(j)*.024],
                [x*1.3,-.16-row*.21,.24-abs(j)*.035],.065,1+(j+row)%2)
# Fan-shaped tail with distinct overlapping rectrices.
for i in range(9):
    u=(i-4)/4
    feather('body',[u*.14,-.57,-.06],[u*.40,-1.51+abs(u)*.13,-.10],.093,1+i%2)
for sign,part in [(-1,'left-wing'),(1,'right-wing')]:
    # Broad shoulder / upper wing, then long separated finger feathers.
    ellipsoid(part,[sign*.61,.10,.015],[.53,.28,.105])
    ellipsoid(part,[sign*1.14,.13,.012],[.43,.21,.08],1)
    for i in range(10):
        x=.28+i*.10
        feather(part,[sign*x,.19,.035],[sign*(x+.15),-.56-i*.019,-.025],.102,1+i%2)
    for i in range(8):
        t=i/7
        feather(part,[sign*(1.04+t*.30),.17-t*.08,.02],
                [sign*(2.24-t*.46),.26-t*1.10,-.045-t*.025],.105,1+i%2)
    for i in range(10):
        x=.26+i*.12
        feather(part,[sign*x,.23,.11],[sign*(x+.16),-.12,.095],.078,2 if i%3==0 else 1,.018)

# Convert ENU author space to the glTF standard (Y up, forward -Z).
conversion=np.array([[1,0,0,0],[0,0,1,0],[0,-1,0,0],[0,0,0,1.]])
for name,meshes in parts.items():
    # Merge by material: small draw-call count, smooth vertex normals retained.
    scene=tm.Scene()
    scene.graph.update(frame_to='maps-basis', matrix=np.linalg.inv(conversion))
    for index,material in enumerate(materials):
        group=[m for m in meshes if m.visual.material is material]
        if not group: continue
        m=tm.util.concatenate(group)
        m.visual=tm.visual.TextureVisuals(material=material)
        m.apply_transform(conversion)
        scene.add_geometry(m, geom_name=f'{name}-{index}', parent_node_name='maps-basis')
    data=scene.export(file_type='glb', include_normals=True)
    (OUT/f'{name}.glb').write_bytes(data)
    print(name, sum(len(m.faces) for m in meshes), 'triangles,',len(data),'bytes')

if __name__=='__main__':
    # Offline geometry contact sheet (not a browser or a map screenshot).
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection
    fig=plt.figure(figsize=(12,6),facecolor='#cad7dc')
    for n,(elev,azim) in enumerate([(65,-90),(22,-65)]):
        ax=fig.add_subplot(1,2,n+1,projection='3d',facecolor='#cad7dc')
        for group in parts.values():
            for m in group:
                rgb=np.array(m.visual.material.baseColorFactor[:3])/255
                normals=m.face_normals
                shade=.48+.52*np.maximum(0,normals@np.array([.3,-.4,.866]))
                colors=np.clip(rgb[None,:]*shade[:,None]*2.3,0,1)
                ax.add_collection3d(Poly3DCollection(m.triangles,facecolors=colors,linewidths=0))
        ax.set(xlim=(-2.4,2.4),ylim=(-2,2),zlim=(-1,1))
        ax.set_box_aspect((4.8,4,2));ax.view_init(elev=elev,azim=azim);ax.set_axis_off()
    fig.tight_layout()
    preview=OUT.parent.parent / '_debug' / 'crow-geometry.png'
    preview.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(str(preview),dpi=150)
