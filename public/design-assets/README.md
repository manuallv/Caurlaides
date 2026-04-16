Copy the external design/template files for the admin panel into this folder.

Recommended workflow:
1. Put the source path into `.env` as `DESIGN_ASSETS_SOURCE=/absolute/path/to/your/design/folder`
2. Run `npm run design:sync`
3. Reference copied CSS, images, icons, or UI assets from EJS templates

This project already uses a neutral professional admin shell, but it is intentionally structured so the supplied design system can replace colors, imagery, and component assets without changing the backend architecture.
