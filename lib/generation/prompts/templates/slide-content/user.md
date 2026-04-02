# Generation Requirements

## Scene Information

- **Title**: {{title}}
- **Description**: {{description}}
- **Key Points**:
  {{keyPoints}}

{{teacherContext}}

## Available Resources

- **Available Images**: {{assignedImages}}
- **Canvas Size**: {{canvas_width}} × {{canvas_height}} px

## CRITICAL: Create Visually Rich Slides with AI-Generated Images

**MANDATORY REQUIREMENT**: Every slide MUST contain at least 1-2 prominent, interactive images. Use the AI-generated images that will be created for this scene. Reference them using their elementId as the src (e.g., "gen_img_1", "gen_img_2"). Do NOT create text-only slides under any circumstances.

**ABSOLUTELY REQUIRED**: Generate slides that are highly visual and engaging with INTERACTIVE IMAGES as the centerpiece, NOT text-heavy lecture slides. Images must be the focal point of every slide design.

### Required Visual Elements (Use ALL of these per slide):
- **IMAGES ARE ABSOLUTELY MANDATORY**: Include at least 1-2 large, prominent images per slide from available resources or use placeholder IDs
- **Interactive Image Elements**: Make ALL images clickable with links, hover effects, zoom capabilities, or information overlays
- **Background colors/gradients** instead of plain white
- **Shapes** (rectangles, circles, arrows) for highlighting and organization around images
- **Colorful accents** and **visual hierarchy** with different colors
- **Icons/graphics** created with shapes when additional images aren't available
- **Layout variety** - center designs around images, not text

### Image Usage Rules (CRITICAL):
- **ALWAYS USE IMAGES**: Use the AI-generated images created for this scene, referencing them by their elementId (e.g., "gen_img_1")
- **Make images LARGE and PROMINENT**: Images should be 300-500px wide, positioned as the main visual element
- **Center images in layout**: Build the entire slide composition around the images
- **Multiple images per slide**: Use 1-2 images minimum, positioned strategically
- **Interactive by default**: Every image MUST have a link property for interactivity

### Interactive Image Features (MANDATORY):
- **Hover Effects**: Images should show tooltips or additional information on hover
- **Click Actions**: Images can trigger popups, zoom views, or navigate to related content
- **Link Integration**: Add `link` property to ALL images - use "web" type for external links or "slide" type for navigation
- **Visual Feedback**: Images should have subtle animations or transitions
- **Contextual Integration**: Images should be positioned to support the slide's main message

### Link Implementation (REQUIRED for ALL images):
```json
"link": {
  "type": "web",
  "target": "https://example.com/learn-more"
}
```
OR
```json
"link": {
  "type": "slide",
  "target": "slide_2"
}
```

**FINAL REQUIREMENT**: Every slide must have images as the primary visual element. Text should be secondary and minimal. Images must be interactive and prominent.

### Visual Design Principles:
- **Image-Centric Design**: Build layouts around images, not just add them as afterthoughts
- **Colorful and modern** - Use theme colors, gradients, and varied backgrounds
- **Structured layout** - Group related content with shapes/containers around images
- **Visual metaphors** - Use images to represent concepts alongside shapes and colors
- **Minimal text** - Keep text concise and let images convey meaning
- **Professional appearance** - Clean, modern design with good spacing

### Image Usage Rules:
- **ALWAYS USE IMAGES**: If images are available, include them prominently in every slide
- **Position Strategically**: Place images where they support the content (not just in corners)
- **Size Appropriately**: Make images large enough to be impactful (200-400px wide)
- **Interactive Integration**: Design images to be interactive elements, not just static decorations

### Avoid:
- Plain white backgrounds with black text
- Walls of bullet point text
- Boring, text-only layouts
- Slides without images when images are available
- Small, insignificant images tucked away in corners
- Non-interactive images that serve no visual purpose

**MANDATORY**: Every slide must contain at least one image element. Use images as the foundation of your visual design.

{"background":{"type":"solid","color":"#ffffff"},"elements":[{"id":"title_001","type":"text","left":60,"top":50,"width":880,"height":76,"content":"<p style=\"font-size:32px;\"><strong>Title Content</strong></p>","defaultFontName":"","defaultColor":"#333333"},{"id":"content_001","type":"text","left":60,"top":150,"width":880,"height":130,"content":"<p style=\"font-size:18px;\">• Point One</p><p style=\"font-size:18px;\">• Point Two</p><p style=\"font-size:18px;\">• Point Three</p>","defaultFontName":"","defaultColor":"#333333"}]}
