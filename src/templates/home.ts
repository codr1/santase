import { renderLayout } from "./layout";

export function renderHomePage(): string {
  const body = `
    <main>
      <h1>Santase</h1>
      <section>
        <form method="post" action="/rooms">
          <button type="submit">Create Room</button>
        </form>
      </section>
      <section>
        <form method="get" action="/join">
          <button type="submit">Join Room</button>
        </form>
      </section>
    </main>
  `;

  return renderLayout({ title: "Santase", body });
}
