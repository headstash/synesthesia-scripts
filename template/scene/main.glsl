
vec4 texMirror(sampler2D samplerIn, vec2 uvIn){
    if (mod(uvIn.x, 2.0) > 1.0){
        uvIn.x = 1.0-uvIn.x;
    }
    if (mod(uvIn.y, 2.0) > 1.0){
        uvIn.y = 1.0-uvIn.y;
    }
    return texture(samplerIn, uvIn);
}

vec4 _isfLoadUserImage(vec2 uv) {
    uv = _invertYAxisVideo(uv);
    return _contrast(_invertImage(texMirror(syn_UserImage, uv)), _Media_Contrast);
}
