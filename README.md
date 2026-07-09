# OKlChroma

Oklchroma is a color pattern generator that helps designers and developers create harmonious color scales based on the OKLCH color space. Instead of manually defining each shade, Oklchroma generates a complete set of color variables based on a single base color and using mathematical formulas in CSS to generate the rest of the colors.

## Why create this?
<p>While I still believe that a handmade color pattern is far more superior, I got this idea from a talk I saw at <a href="https://www.youtube.com/watch?v=su6WA0kUUJE" target="_blank">CSS Day 2024 by Matthias Ott</a>. It uses trigonometric functions in CSS to adjust the lightness of the primary input. The clever thing that was explained in the presentation is that a trigonometric function (sin()) is used to adjust the Chroma.</p>
<p>I thought this idea was so clever and was curious how it would work with different color inputs and this is how that little idea was born.</p>

## Color spaces

The source color can be defined in any of the supported CSS color spaces (OKLCH, OKLab, LCH, Lab, HSL, HWB, sRGB, XYZ, Display P3, A98 RGB, ProPhoto RGB, Rec. 2020) — plus classic hex notation, where the R/G/B sliders and value fields show and accept two-digit hex pairs and the color is formatted as `#rrggbb`. Hex support increases interoperability with classical web color tools and platforms, some of which are not colorspace-aware.

### CSS output in other color spaces

By default the generated CSS uses dynamic OKLCH relative-color variables. The CSS Output panel at the end of the editor lets you write the output in any supported color space (including hex) instead: every generated color is converted to the chosen space before the CSS output is updated, so the palette can be used in places that don't support OKLCH yet.

**Caveat:** not all colors supported by all gamuts are usable in every color space. Converting to a narrower space (e.g. hex or sRGB, which can only represent the sRGB gamut) gamut-maps out-of-range colors to the nearest representable color, so wide-gamut shades may shift.

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                | Action                                           |
| :--------------------- | :----------------------------------------------- |
| `pnpm install`         | Installs dependencies                            |
| `pnpm dev`             | Starts local dev server at `localhost:4321`      |
| `pnpm build`           | Build your production site to `./dist/`          |
| `pnpm preview`         | Preview your build locally, before deploying     |
| `pnpm astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `pnpm astro -- --help` | Get help using the Astro CLI                     |
