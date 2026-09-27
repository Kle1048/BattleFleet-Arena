"""Native Blender material workflow: reuse F124 maps and bake game-ready PBR.

No added polygons. Unique UVs keep gravity-aligned runoff on the hull, not on
windows or radomes. Source bitmaps are reused verbatim, never edited.
Loaded by create_gepard_asset.py after batching and before exporting.
"""
def weather_gepard(hull,templates,weapons,slots,rails,instance,part_keys=None,finalize=True):
    slug=globals().get('ASSET_SLUG','gepard')
    label=slug.title()
    texdir=OUT/'textures/weathered'; texdir.mkdir(parents=True,exist_ok=True)
    f124=ROOT/'assets/blender/f124/weathered/textures'
    weather=bpy.data.images.load(str(f124/'f124_surface_weathered.png'),check_existing=False)
    runoff=bpy.data.images.load(str(f124/'f124_rust_runoff_rgba.png'),check_existing=False)
    engine=scene.render.engine;scene.render.engine='CYCLES';scene.cycles.samples=4
    scene.cycles.device='CPU';scene.render.bake.margin=12
    records=json.loads(scene.get('weathering_parts','[]'))
    for key,col in [('hull',hull),*templates.items()]:
        if part_keys is not None and key not in part_keys:continue
        (OUT/'weathering-progress.json').write_text(json.dumps({'part':key,'stage':'unwrap'}))
        ob=next(o for o in col.objects if o.type=='MESH')
        ob.data.calc_loop_triangles();before=len(ob.data.loop_triangles)
        bpy.ops.object.select_all(action='DESELECT');ob.select_set(True)
        bpy.context.view_layer.objects.active=ob
        ob.data.uv_layers.active.name='SourceAtlas'
        ob.data.uv_layers.new(name='WeatherBake')
        # Joined lettering can bring a second UV layer. Never assume index 1.
        ob.data.uv_layers.active_index=len(ob.data.uv_layers)-1
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.008,area_weight=1,correct_aspect=True)
        bpy.ops.object.mode_set(mode='OBJECT')
        ob.data.uv_layers['WeatherBake'].active_render=True
        mat=paint.copy();mat.name=label+'_SeaService_'+key
        ob.data.materials.clear();ob.data.materials.append(mat)
        for p in ob.data.polygons:p.material_index=0
        n=mat.node_tree.nodes;l=mat.node_tree.links;bs=n.get('Principled BSDF');out=n.get('Material Output')
        uv=n.new('ShaderNodeUVMap');uv.uv_map='SourceAtlas'
        for t in list(n):
            if t.type=='TEX_IMAGE':l.new(uv.outputs['UV'],t.inputs['Vector'])
        original=bs.inputs['Base Color'].links[0].from_socket
        def mathnode(op,a,b=None):
            t=n.new('ShaderNodeMath');t.operation=op
            for i,x in enumerate((a,b)):
                if x is None:continue
                if isinstance(x,(int,float)):t.inputs[i].default_value=x
                else:l.new(x,t.inputs[i])
            return t.outputs[0]
        def mix(a,b,f):
            t=n.new('ShaderNodeMixRGB')
            for i,x in enumerate((f,a,b)):
                if isinstance(x,(int,float)):t.inputs[i].default_value=x
                elif isinstance(x,tuple):t.inputs[i].default_value=x
                else:l.new(x,t.inputs[i])
            return t.outputs[0]
        # Sample tile interiors: avoid repeating the atlas's corner bolts on
        # every narrow low-poly strip. Leave source UVs and original colors intact.
        sep=n.new('ShaderNodeSeparateXYZ');l.new(uv.outputs[0],sep.inputs[0])
        combine=n.new('ShaderNodeCombineXYZ')
        for axis in ('X','Y'):
            scaled=mathnode('MULTIPLY',sep.outputs[axis],4)
            tile=mathnode('FLOOR',scaled)
            fract=mathnode('FRACT',scaled)
            centered=mathnode('ADD',mathnode('MULTIPLY',fract,.66),.17)
            l.new(mathnode('MULTIPLY',mathnode('ADD',tile,centered),.25),combine.inputs[axis])
        t=n.new('ShaderNodeTexImage');t.image=weather;l.new(combine.outputs[0],t.inputs[0])
        color=mix(original,t.outputs['Color'],.40)
        geom=n.new('ShaderNodeNewGeometry')
        noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=5.5;noise.inputs['Detail'].default_value=2
        l.new(geom.outputs['Position'],noise.inputs['Vector'])
        rough=mathnode('ADD',mathnode('MULTIPLY',noise.outputs['Fac'],.16),.68)
        bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.10;bump.inputs['Distance'].default_value=.004
        l.new(noise.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs[0],bs.inputs['Normal'])
        patches=[]
        if key=='hull':
            pos=n.new('ShaderNodeSeparateXYZ');l.new(geom.outputs['Position'],pos.inputs[0])
            normal=n.new('ShaderNodeSeparateXYZ');l.new(geom.outputs['Normal'],normal.inputs[0])
            wall=mathnode('GREATER_THAN',mathnode('ABSOLUTE',normal.outputs['X']),.72)
            # Small salt haze just above the boot stripe, not on all paintwork.
            height=mathnode('MAXIMUM',mathnode('SUBTRACT',1.10,pos.outputs['Z']),0)
            above=mathnode('GREATER_THAN',pos.outputs['Z'],.26)
            salt=mathnode('MULTIPLY',mathnode('MULTIPLY',height,above),mathnode('MULTIPLY',wall,.10))
            color=mix(color,(.46,.48,.47,1),salt)
            for side in (-1,1):
                for i,(z,w,h) in enumerate(globals().get('WEATHER_PATCHES',[(-26,.45,.85),(-22,.62,1.16),(-12,.54,1.3),(-7,.38,.8),(8,.60,1.35),(18,.72,1.4),(23,.48,1.15)])):
                    if side<0 and i in (0,3):continue
                    z+=.18 if side<0 else 0
                    top=interp(z,2)-.10;patches.append((side,z,w,h))
                    coord=n.new('ShaderNodeCombineXYZ')
                    u=mathnode('ADD',mathnode('DIVIDE',mathnode('ADD',pos.outputs['Y'],z),w),.5)
                    v=mathnode('DIVIDE',mathnode('SUBTRACT',pos.outputs['Z'],top-h),h)
                    l.new(u,coord.inputs['X']);l.new(v,coord.inputs['Y'])
                    tex=n.new('ShaderNodeTexImage');tex.image=runoff;tex.extension='CLIP';l.new(coord.outputs[0],tex.inputs[0])
                    hs=n.new('ShaderNodeHueSaturation');hs.inputs['Saturation'].default_value=.72;hs.inputs['Value'].default_value=.80
                    l.new(tex.outputs['Color'],hs.inputs['Color'])
                    side_mask=mathnode('GREATER_THAN',mathnode('MULTIPLY',pos.outputs['X'],side),0)
                    alpha=mathnode('MULTIPLY',tex.outputs['Alpha'],mathnode('MULTIPLY',wall,mathnode('MULTIPLY',side_mask,.55)))
                    color=mix(color,hs.outputs[0],alpha)
                    rough=mathnode('ADD',rough,mathnode('MULTIPLY',alpha,.12))
        l.new(color,bs.inputs['Base Color']);l.new(rough,bs.inputs['Roughness']);bs.inputs['Metallic'].default_value=.045
        emission=n.new('ShaderNodeEmission')
        size=4096 if key=='hull' else 1024
        baked={}
        for channel,socket in [('basecolor',color),('roughness',rough),('normal',None)]:
            (OUT/'weathering-progress.json').write_text(json.dumps({'part':key,'stage':'bake','channel':channel}))
            im=bpy.data.images.new(label+'_'+key+'_'+channel,width=size,height=size,alpha=False)
            if channel!='basecolor':im.colorspace_settings.name='Non-Color'
            target=n.new('ShaderNodeTexImage');target.image=im;n.active=target
            if socket is not None:
                l.new(socket,emission.inputs['Color']);l.new(emission.outputs[0],out.inputs['Surface'])
                bpy.ops.object.bake(type='EMIT',uv_layer='WeatherBake')
            else:
                l.new(bs.outputs[0],out.inputs['Surface']);bpy.ops.object.bake(type='NORMAL',uv_layer='WeatherBake')
            im.filepath_raw=str(texdir/(slug+'_'+key+'_'+channel+'.png'));im.file_format='PNG';im.save();im.pack();baked[channel]=im
        # Only simple glTF-compatible PBR connections remain in the final file.
        n.clear();output=n.new('ShaderNodeOutputMaterial');p=n.new('ShaderNodeBsdfPrincipled');l.new(p.outputs[0],output.inputs[0])
        p.inputs['Metallic'].default_value=.045
        for channel,socket in [('basecolor','Base Color'),('roughness','Roughness'),('normal','Normal')]:
            t=n.new('ShaderNodeTexImage');t.image=baked[channel]
            if channel=='normal':
                norm=n.new('ShaderNodeNormalMap');l.new(t.outputs['Color'],norm.inputs['Color']);l.new(norm.outputs[0],p.inputs[socket])
            else:l.new(t.outputs['Color'],p.inputs[socket])
        # Removing a custom-data layer invalidates previously retrieved RNA
        # layer handles. Keep names only and resolve each handle afresh.
        for layer_name in [layer.name for layer in ob.data.uv_layers]:
            if layer_name!='WeatherBake':ob.data.uv_layers.remove(ob.data.uv_layers[layer_name])
        ob.data.uv_layers.active_index=0;ob.data.uv_layers.active.name='UVMap'
        ob.data.calc_loop_triangles();assert len(ob.data.loop_triangles)==before
        records.append({'part':key,'triangles':before,'texture_resolution':size,'rust_patches':len(patches),'maps':list(baked)})
        scene['weathering_parts']=json.dumps(records)
    scene.render.engine=engine
    if not finalize:return records
    # Recreate only this newly generated scene's preview from the baked templates.
    for ob in list(weapons.objects):bpy.data.objects.remove(ob,do_unlink=True)
    for p,yaw,key in [*slots.values(),*rails.values()]:instance(key,p,yaw)
    scene['weathering']='F124 sea-service style; UV-baked color, roughness and tangent normals; no added geometry'
    (OUT/'weathering-progress.json').write_text(json.dumps({'stage':'complete'}))
    (OUT/'weathering-validation.json').write_text(json.dumps({'passed':True,'parts':records,'no_added_triangles':True,'source':'F124 existing weathered atlas and alpha runoff','atlas_blend':.40,'rust_opacity':.55},indent=2))
