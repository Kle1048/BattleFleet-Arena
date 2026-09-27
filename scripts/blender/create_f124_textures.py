"""Deterministic, original UV textures; no third-party photographs baked into the model."""
from pathlib import Path
import random
import numpy as np
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parents[2] / "assets/blender/f124/textures"
OUT.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(124)
random.seed(124)
palette = [(148,162,166),(182,191,191),(77,92,99),(126,143,150),
           (22,37,46),(36,42,45),(101,111,112),(127,60,47),
           (202,204,193),(204,157,59),(47,63,70),(131,146,150),
           (69,86,94),(171,180,177),(102,116,118),(32,35,36)]
atlas = np.zeros((1024,1024,3),dtype=np.uint8)
rough = np.full((1024,1024,3),180,dtype=np.uint8)
for i,col in enumerate(palette):
    y,x=divmod(i,4); yy,xx=np.mgrid[0:256,0:256]
    noise=rng.normal(0,1.1,(256,256))+np.sin(xx/21)*0.6
    shade=1-0.025*np.exp(-yy/14)
    atlas[y*256:(y+1)*256,x*256:(x+1)*256]=np.clip(np.array(col)[None,None,:]*shade[:,:,None]+noise[:,:,None],0,255)
    rough[y*256:(y+1)*256,x*256:(x+1)*256]= 80 if i==4 else 192 if i in (2,7) else 163
im=Image.fromarray(atlas); d=ImageDraw.Draw(im)
# Panels, ventilation slats and steel access covers live in dedicated atlas tiles.
for i in (0,1,3,6,11,13,14):
    y,x=divmod(i,4); x*=256; y*=256
    d.rectangle((x+10,y+10,x+246,y+246),outline=tuple(max(0,c-14) for c in palette[i]),width=2)
    for a,b in ((18,18),(238,18),(18,238),(238,238)):
        d.ellipse((x+a-2,y+b-2,x+a+2,y+b+2),fill=(98,111,115))
for y in range(520,753,12):
    d.line((525,y,754,y),fill=(34,43,48),width=5)
    d.line((525,y+5,754,y+5),fill=(128,142,145),width=2)
im.save(OUT/'f124_surface_basecolor.png')
Image.fromarray(rough).save(OUT/'f124_surface_roughness.png')

# Flight deck: 15.4 x 28 m, bow at top of the image.
w,h=768,1408
noise=rng.normal(0,1.7,(h,w,1))
deck=Image.fromarray(np.clip(np.array([66,82,88])+noise,0,255).astype('uint8'))
d=ImageDraw.Draw(deck)
white=(217,217,193); yellow=(208,172,73)
d.rectangle((44,38,w-44,h-38),outline=white,width=5)
# Reference deck uses a small concentric landing mark and a solid cross-axis,
# not the oversized generic H in the first prototype.
cx,cy=w//2,850
for r in (130,96): d.ellipse((cx-r,cy-r,cx+r,cy+r),outline=white,width=5)
d.line((cx,100,cx,cy-135),fill=white,width=5)
d.line((cx,cy+135,cx,h-65),fill=white,width=5)
d.line((44,cy,cx-135,cy),fill=white,width=5)
d.line((cx+135,cy,w-44,cy),fill=white,width=5)
d.line((cx-17,cy,cx+17,cy),fill=white,width=4)
d.line((cx,cy-17,cx,cy+17),fill=white,width=4)
for x in range(25,w-25,40): d.line((x,56,x+24,90),fill=yellow,width=9)
for x in range(95,w-90,94):
    for y in range(175,h-100,130):
        d.ellipse((x-3,y-3,x+3,y+3),outline=(123,141,146),width=1)
try: font=ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf',40)
except OSError: font=ImageFont.load_default()
d.text((cx,175),'F 221',anchor='mm',font=font,fill=white)
deck.save(OUT/'f124_flightdeck_basecolor.png')

# Alpha decal textures for identification and German naval jack (stylized).
decal=Image.new('RGBA',(1024,256),(0,0,0,0)); d=ImageDraw.Draw(decal)
try: font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',195)
except OSError: font=ImageFont.load_default()
d.text((520,130),'F 221',anchor='mm',font=font,fill=(30,37,40,255),stroke_width=4)
d.text((515,125),'F 221',anchor='mm',font=font,fill=(232,232,213,255))
decal.save(OUT/'f124_pennant.png')
print('Created four original texture maps in',OUT)
