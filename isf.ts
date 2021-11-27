import {existsSync, readFileSync, writeFileSync, rmSync, cpSync, renameSync, copyFileSync, mkdirSync} from 'fs';
import { join, dirname, basename, extname } from 'path';
import {getFiles} from "./util";

const cwd = join(__dirname);
const isfPath = join(cwd, 'input');

const HEIGHT = 1080;
const WIDTH = 1920;

(async () => {

    // find all ISF shaders
    const isfFiles = await getFiles(isfPath) || [];
    const dir = isfFiles.filter(file => file.match(/\.fs$/));
    const result = await Promise.all(dir.map(async shaderPath => {
        // grab fragment shader
        const shaderDir = dirname(shaderPath);
        const shaderName = basename(shaderPath);
        let shaderContent = readFileSync(shaderPath, {encoding:'utf-8'});

        let shaderJsonContent;
        let shaderJsonObject;
        // trim new lines
        shaderContent = shaderContent.replace(/}[\s\r\n]+\*\//g, "}*/");
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
                } catch (_e: any) {
                    let e = new Error(shaderPath + ' - Unable to parse JSON: ' + _e.toString());
                    //console.error(e);
                    return e;
                }
            }
        }

        if (!shaderJsonObject) {
            let e = new Error(shaderPath + ' - Unable to find JSON in shader.');
            return e;
        }

        const lastFolderIndex = shaderDir.lastIndexOf('\\');
        let lastFolder = (shaderJsonObject && shaderJsonObject.CATEGORIES && shaderJsonObject.CATEGORIES.indexOf('GLSLSandbox') > -1 ? 'GLSLSandbox' : null) ||
            ((shaderJsonObject && shaderJsonObject.CATEGORIES && shaderJsonObject.CATEGORIES.indexOf('Shadertoy') > -1) || (shaderJsonObject && shaderJsonObject.DESCRIPTION && shaderJsonObject.DESCRIPTION.match('www.shadertoy.com')) ? 'Shadertoy' : null) ||
            shaderPath.substring(lastFolderIndex+1).replace('\\' + shaderName, '').replace(/^input/, 'Effect');
        if (lastFolder === 'Effect' && (!shaderContent.match('iChannel0') && !shaderContent.match('inputImage'))) {
            lastFolder = 'Generators';
        }
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
        sceneJson.HEIGHT = HEIGHT;
        sceneJson.WIDTH = WIDTH;
        let imageNum = 0;
        const imageDir = join(outputPath, 'images');
        const IMAGES = ((shaderJsonObject && shaderJsonObject.IMPORTED && shaderJsonObject.IMPORTED instanceof Array) ? shaderJsonObject.IMPORTED : []);
        if (IMAGES.length) {
            mkdirSync(imageDir);
        }
        sceneJson.IMAGES = IMAGES.map(image => {
            const IMAGE: any = {};
            if (!image.PATH) return new Error('No image path.');

            if (image.TYPE === 'cube' || image.PATH instanceof Array) {
                return new Error('Cubemaps are not supported yet: ' + image.NAME);
            }

            const inputImagePath = join(shaderDir, image.PATH);
            if (!existsSync(inputImagePath)) {
                return new Error('File not found: ' + inputImagePath);
            }

            ++imageNum
            //console.log('Adding image to:', shaderName, inputImagePath);
            const NAME = image.NAME || 'image' + imageNum;
            IMAGE.NAME = NAME;
            const ext = extname(image.PATH);
            const imageFilename = `${NAME}${ext}`;
            IMAGE.PATH = 'images\\' + imageFilename;
            const outputImagePath = join(imageDir, imageFilename);
            try {
                copyFileSync(inputImagePath, outputImagePath);
            } catch (e: any) {
                //console.warn(e);
                return e;
            }
            return IMAGE;
        });
        const imageErrors = sceneJson.IMAGES.filter(image => image instanceof Error);
        if (imageErrors.length) {
            return new Error('Failed to add images. ' + imageErrors.map(e => e.toString()));
        }

        let passes = 1;
        sceneJson.PASSES = (shaderJsonObject.PASSES || []).map(pass => {
            ++passes;
            let TARGET = pass.TARGET && pass.TARGET.toString() || 'UnnamedPass' + passes;
            const FLOAT = (typeof pass.FLOAT !== 'undefined' ? pass.FLOAT : true);
            const PASS: any = {
                TARGET,
                HEIGHT,
                WIDTH
            };
            if (FLOAT) {
                PASS.FLOAT = FLOAT;
            }

            return PASS;
        }).filter(pass => !(pass instanceof Error));
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
                    // in-line condition
                    shaderContent = shaderContent.replaceAll(new RegExp(`\\(?\\!?\\!?${control.NAME}\\)?.?\\?`, 'g'), `(${control.NAME} > 0.5) ?`);
                    shaderContent = shaderContent.replaceAll(new RegExp(`\\(\\!?\\!?${control.NAME}\\)`, 'g'), `(${control.NAME} > 0.5)`);
                    shaderContent = shaderContent.replaceAll(new RegExp(`${control.NAME}.?==.?(true)`, 'g'), `${control.NAME} > 0.5`);
                    shaderContent = shaderContent.replaceAll(new RegExp(`${control.NAME}.?==.?(false)`, 'g'), `${control.NAME} < 0.5`);
                    break;
                case 'image':
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
        sceneJson.CREDIT = shaderJsonObject && shaderJsonObject.CREDIT && shaderJsonObject.CREDIT.trim().replace(/$by /, '');
        sceneJson.DESCRIPTION = shaderJsonObject && shaderJsonObject.DESCRIPTION;
        console.log('Creating scene:', displayName);

        if (shaderJsonEnd > -1) {
            shaderContent = shaderContent.substring(shaderJsonEnd+4, shaderContent.length);
        }
        const piRegExp = /(const)?.?float.?PI.?=.?3\.14[\d]+;[^\n]*\n/g;
        const findPis = shaderContent.match(piRegExp);
        if (findPis) {
            shaderContent = shaderContent.replaceAll(piRegExp, '');
        }

        shaderContent = shaderContent.replace(/void main.?\(.?(void)?.?\)[\s\r\n]*\{/, `
vec4 renderMainImage() {
    vec4 fragColor = vec4(0.0);
    vec2 fragCoord = _xy;
`);
        //const closingRegExp = /(gl_FragColor(\.[\w]+)?.?.?=.?[^;]+);[\s\r\n]*}/;
        //const closingMatch = shaderContent.match(closingRegExp);
        const closingBracketMatch = shaderContent.lastIndexOf("}");
        if (closingBracketMatch) {

            shaderContent = shaderContent.substring(0, closingBracketMatch) + "\n\treturn fragColor;\n}\n";
            if (shaderContent.match('PASSINDEX')) {
                shaderContent += "vec4 renderMain(){return renderMainImage();}\n";
            } else {
                shaderContent += `
vec4 renderMain(){
    if(PASSINDEX == 0){
        return renderMainImage();
    }
}
`;
            }
        } else {
            let e = new Error(shaderPath + ' - Shader file has no code.');
            console.warn(e);
            return e;
        }
        shaderContent = shaderContent
            .replaceAll(/(Time)|(TIME)/g, 'script_time')
            .replaceAll('gl_FragColor', 'fragColor')
            .replaceAll(/(feedbackBuffer)|(backBuffer)/g, 'syn_FinalPass')
            .replaceAll('inputImage', 'syn_UserImage')
            .replaceAll('FRAMEINDEX', 'FRAMECOUNT')
            .replaceAll(/varying\s*vec2\s*texOffsets\[\d\];[\s\r\n]*/g, '')
            .replaceAll(/texOffsets\[\d\]/g, '(gl_FragCoord.xy / RENDERSIZE.xy)')
            .replaceAll('isf_FragNormCoord', '(gl_FragCoord.xy / RENDERSIZE.xy)')
            .replaceAll('texture2DRect(', 'IMG_NORM_PIXEL(')
            .replaceAll('texture2D(', 'IMG_PIXEL(')
            .replaceAll(/IMG_NORM_PIXEL\(iChannel\d/g, 'IMG_NORM_PIXEL(syn_UserImage')
            .replaceAll('IMG_PIXEL(iChannel0', 'IMG_PIXEL(syn_UserImage')
            .replaceAll(/IMG_NORM_PIXEL\(syn_UserImage.?,/g, '_isfLoadUserImage(');
        if (shaderContent.match('gl_FragCoord')) {

        }
        if (shaderContent.match('script_time')) {
            sceneJson.CONTROLS.push({
                "DEFAULT": 1,
                "DESCRIPTION": "How fast the time variable grows, whether it is reactive time or constant time.",
                "IS_META": false,
                "PARAMS": 0.299999993294477,
                "MAX": 2,
                "MIN": -2,
                "NAME": "rate_in",
                "TYPE": "knob",
                "UI_GROUP": "defaults"
            });
        }
        //prepend template shader file
        shaderContent = readFileSync(shaderContentPath, {encoding:'utf-8'}) + "\n" + shaderContent;

        // overwrite shader file
        writeFileSync(shaderContentPath, shaderContent);
        // remove scene.json
        rmSync(sceneJsonPath);
        // write scene.json
        writeFileSync(sceneJsonPath, JSON.stringify(sceneJson, null, "\t"));
        return {
            message: shaderName + " created successfully."
        }
    }));
    const successNum = result.filter(res => !(res instanceof Error)).length;
    console.log('Created', successNum, 'scenes!');
    if (successNum < result.length) {
        console.log('Failed to create', result.length - successNum, 'scenes! :(');
        //const errors = result.filter(res => res instanceof Error);
        //console.log(errors);
    }
})();
