import {existsSync, readFileSync, writeFileSync, rmSync, cpSync, renameSync} from 'fs';
import { join, dirname, basename } from 'path';
import {getFiles} from "./util";

const cwd = join(__dirname);
const isfPath = join(cwd, 'input');

(async () => {

    // find all ISF shaders
    const isfFiles = await getFiles(isfPath) || [];
    const dir = isfFiles.filter(file => file.match(/\.fs$/));
    await Promise.all(dir.map(async shaderPath => {
        // grab fragment shader
        const shaderDir = dirname(shaderPath);
        const shaderName = basename(shaderPath);
        let shaderContent = readFileSync(shaderPath, {encoding:'utf-8'}).replace(/\n/, '').replace(/\r/, '').replace(/\t/, '').replace(/$\/\/.*\n/g, '');

        let shaderJsonContent;
        let shaderJsonObject;
        shaderContent = shaderContent.replace("}\n\n*/", "}*/")
        //let shaderJsonContent = shaderContent.match(
        // new RegExp('/\*({.+}\*/)', 'ms'));
        let shaderJsonEnd = shaderContent.indexOf("}*/");
        if (shaderJsonEnd === -1) shaderJsonEnd = shaderContent.indexOf("}\n*/");
        if (shaderJsonEnd > -1) {
            try {
                shaderJsonContent = shaderContent.trim().substring(2, shaderJsonEnd);
                shaderJsonObject = JSON.parse(shaderJsonContent);
            } catch (e) {
                try {
                    shaderJsonContent = shaderContent.trim().substring(2, shaderJsonEnd) + '}';
                    shaderJsonObject = JSON.parse(shaderJsonContent);
                } catch (e) {

                    return;
                }
            }
        }

        const lastFolderIndex = shaderDir.lastIndexOf('\\');
        const lastFolder = (shaderJsonObject && shaderJsonObject.CATEGORIES && shaderJsonObject.CATEGORIES.indexOf('GLSLSandbox') > -1 ? 'GLSLSandbox' : null) ||
            ((shaderJsonObject && shaderJsonObject.CATEGORIES && shaderJsonObject.CATEGORIES.indexOf('Shadertoy') > -1) || (shaderJsonObject && shaderJsonObject.DESCRIPTION && shaderJsonObject.DESCRIPTION.match('www.shadertoy.com')) ? 'Shadertoy' : null) ||
            shaderPath.substring(lastFolderIndex+1).replace('\\' + shaderName, '').replace(/^input/, 'Effect');
        // output location

        const outputFolder = shaderName.replace('.fs', '').trim().replace(/\s/g, '_').replace(/\W/g, '').toLowerCase() + '.synScene';
        const outputPath = join(cwd, 'output', lastFolder, outputFolder);
        const shaderContentPath = join(outputPath, 'main.glsl');

        // remove existing output for shader
        if (existsSync(outputPath)) rmSync(outputPath,{recursive:true});

        // copy template
        cpSync(join(cwd, 'template', 'scene'), join(outputPath), {recursive:true});

        const thumbnailPath = outputFolder.replace('.synScene', '') + '.png';
        renameSync(join(outputPath, 'thumb.png'), join(outputPath, thumbnailPath));

        // get content of scene.json file
        const sceneJsonPath = join(outputPath, 'scene.json');
        const sceneJson: { [key: string]: any } = JSON.parse(readFileSync(sceneJsonPath, {encoding:'utf-8'}));

        let displayName = shaderName.replace('.fs', '');
        sceneJson.TITLE = displayName;
        sceneJson.CONTROLS = sceneJson.CONTROLS.concat((shaderJsonObject && shaderJsonObject.INPUTS || []).map(control => {
            if (control.NAME === 'inputImage') return;
            if (control.MIN instanceof Array) {
                control.MIN = control.MIN[0];
            }
            if (control.MAX instanceof Array) {
                control.MAX = control.MAX[0];
            }
            if (control.DEFAULT instanceof Array) {
                control.DEFAULT = control.DEFAULT[0];
            }
            const controlJson: any = {
                "DEFAULT" : control.DEFAULT,
                "DESCRIPTION" : control.LABEL,
                "IS_META" : false,
                "NAME" : control.NAME,
                "UI_GROUP" : "defaults"
            };
            switch (control.TYPE) {
                case 'point2D':
                    controlJson.TYPE = 'xy smooth';
                    break;
                case 'bool':
                    controlJson.TYPE = 'toggle';
                    controlJson.MIN = 0.0;
                    controlJson.MAX = 1.0;
                    controlJson.DEFAULT = (!control.DEFAULT || (control && typeof control.DEFAULT === 'string' && control.DEFAULT.toLowerCase() === 'false')) ? 0.0 : 1.0;
                    shaderContent = shaderContent.replaceAll(new RegExp(`\\(${control.NAME}\\)`, 'g'), `(${control.NAME} > 0.5)`);
                    shaderContent = shaderContent.replaceAll(new RegExp(`${control.NAME}\s==\s(true)`, 'g'), `${control.NAME} > 0.5`);
                    shaderContent = shaderContent.replaceAll(new RegExp(`${control.NAME}\s==\s(false)`, 'g'), `${control.NAME} < 0.5`);
                    break;
                case 'color':
                    controlJson.TYPE = 'color';
                    break;
                case "float":
                default:
                    controlJson.TYPE = 'slider smooth';
                    break;
            }
            if (control.MIN || control.MAX) {
                controlJson.MIN = control.MIN || 0;
                controlJson.MAX = control.MAX || 1;
            }
            return controlJson;
        }).filter(control => !!control));
        sceneJson.IMAGE_PATH = thumbnailPath;
        sceneJson.CREDIT = shaderJsonObject && shaderJsonObject.CREDIT;
        sceneJson.DESCRIPTION = shaderJsonObject && shaderJsonObject.DESCRIPTION;
        console.log('Adding scene:', displayName);

        if (shaderJsonEnd > -1) {
            shaderContent = shaderContent.substring(shaderJsonEnd+4, shaderContent.length);
        }
        const piRegExp = /float PI = 3\.14[\d]+;\n?\n?/g;
        const findPis = shaderContent.match(piRegExp);
        if (findPis) {
            shaderContent = shaderContent.replaceAll(piRegExp, '');
        }

        //vec3 iResolution = vec3(RENDERSIZE, 1.);

        shaderContent = shaderContent.replace(/void main\(\s?(void)?\s?\)\s?\n?{\n?/, `
vec4 renderMainImage() {
    vec4 fragColor = vec4(0.0);
    vec2 fragCoord = _xy;
`);
        const closingRegExp = /(gl_FragColor(\.[\w]+)?\s?.?=\s?[^;]+);[\s\n]*}/;
        const closingMatch = shaderContent.match(closingRegExp);
        if (closingMatch) {
            shaderContent = shaderContent.replace(closingRegExp, `
    $1;
    return fragColor;
}

vec4 renderMain(){
    if(PASSINDEX == 0){
        return renderMainImage();
    }
}
`);
        } else {
            // TODO Append `return fragColor;` if no return exists
            const closingBracketMatch = shaderContent.lastIndexOf("}");
        }
        shaderContent = shaderContent
            .replaceAll('gl_FragColor', 'fragColor')
            .replaceAll('inputImage', 'syn_UserImage')
            .replaceAll('FRAMEINDEX', 'FRAMECOUNT')
            .replaceAll('isf_FragNormCoord', '(gl_FragCoord.xy / RENDERSIZE.xy)')
            .replaceAll('texture2DRect(', 'IMG_NORM_PIXEL(')
            .replaceAll('texture2D(', 'IMG_PIXEL(')
            .replaceAll('IMG_NORM_PIXEL(iChannel0', 'IMG_NORM_PIXEL(syn_UserImage')
            .replaceAll('IMG_PIXEL(iChannel0', 'IMG_PIXEL(syn_UserImage');
        //prepend template shader file
        shaderContent = readFileSync(shaderContentPath, {encoding:'utf-8'}) + "\n" + shaderContent;
        // overwrite ISF shader file
        writeFileSync(shaderContentPath, shaderContent);

        // write scene.json
        writeFileSync(join(outputPath,  'scene.json'), JSON.stringify(sceneJson, null, "\t"));
    }));
})();
