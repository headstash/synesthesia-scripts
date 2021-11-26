# Synesthesia Scripts

Built with Node.js and TypeScript because that's what I'm into. No external dependencies except TypeScript definitions.

## ISF to SSF (Synesthesia Shader Format)

Place ISF shaders into `./input` folder. Folder will be searched recursively for files ending in `.fs`. Generated scenes will
have their folder names prepended to them for organizational purposes since you can potentially generate thousands of scenes. 
Please don't try to load thousands of scenes into Synesthesia before or during a performance. You have been warned.

1. Install Node.js
2. Run `npm run isf`

### Resources

* [SSF Documentation](https://synesthesia.live/docs/ssf/ssf.html)
* [ISF Spec](https://github.com/mrRay/ISF_Spec/)
* [Sheltron's GLSL Resources](https://nshelton.github.io/resources/)

### Shaders

* [ISF Test/Tutorial filters](https://vidvox.net/rays_oddsnends/ISF%20tests+tutorials.zip)
* [ISF Files GitHub Repository](https://github.com/vidvox/ISF-FILES)
* [ISF Shader Library for HeavyM](https://github.com/sophiadigitalart/ShadersLibrary)
