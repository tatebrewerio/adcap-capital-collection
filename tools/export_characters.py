# Exports the male and female character layers (400x550 sprite rects) from the equipment bundles,
# placing each trimmed texture at its textureRectOffset so the layers stack exactly as in the game.
import UnityPy,glob,os,sys
from PIL import Image
out=sys.argv[1];want=set(sys.argv[2].split(',')) if len(sys.argv)>2 else None
for gender in ('male','female'):
    os.makedirs(f'{out}/{gender}',exist_ok=True)
    for b in glob.glob(f'/home/claude/bundles/*equipment{gender}_*'):
        e=UnityPy.load(b)
        for o in e.objects:
            if o.type.name!='Sprite':continue
            s=o.read()
            if want is not None and s.m_Name not in want:continue
            rd=s.m_RD;W=round(s.m_Rect.width);H=round(s.m_Rect.height)
            im=s.image;canvas=Image.new('RGBA',(W,H))
            x=round(rd.textureRectOffset.x);y=round(H-rd.textureRectOffset.y-im.size[1])
            canvas.paste(im,(x,y),im if im.mode=='RGBA' else None)
            canvas.save(f'{out}/{gender}/{s.m_Name}.png',optimize=True)
