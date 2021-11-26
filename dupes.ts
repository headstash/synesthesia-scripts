import {getFiles} from "./util";
import {basename, join} from "path";
import {rmSync} from "fs";

(async () => {
    const dir = (await getFiles(join(__dirname, 'input')));
    const uniqueThings = {};
    await Promise.all(dir.map(async shaderPath => {
        const name = basename(shaderPath);
        if (!uniqueThings[name]) {
            uniqueThings[name] = shaderPath;
        } else {
            console.log('Dupe!', uniqueThings[name], shaderPath);
            //rmSync(uniqueThings[name]);
        }
    }));
})();
