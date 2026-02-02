import { escapeHtml } from "../utils/html";

type LayoutOptions = {
  title: string;
  body: string;
};

export function renderLayout({ title, body }: LayoutOptions): string {
  const safeTitle = escapeHtml(title);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <script src="https://unpkg.com/htmx.org@1.9.12"></script>
    <script src="https://unpkg.com/htmx.org@1.9.12/dist/ext/sse.js"></script>
  </head>
  <body>
    ${body}
  </body>
</html>`;
}
