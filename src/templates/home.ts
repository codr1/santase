import { renderLayout } from "./layout";
import { buttonBaseClasses } from "./styles";

export function renderHomePage(): string {
  const body = `
    <main class="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <h1 class="text-4xl font-bold tracking-tight sm:text-5xl">
        Santase
      </h1>
      <section>
        <form method="post" action="/rooms">
          <button
            type="submit"
            class="${buttonBaseClasses} bg-red-600 hover:bg-red-700 hover:shadow-lg focus:ring-red-500"
          >
            Create Room
          </button>
        </form>
      </section>
      <section>
        <form method="get" action="/join">
          <button
            type="submit"
            class="${buttonBaseClasses} bg-emerald-600 hover:bg-emerald-700 hover:shadow-lg focus:ring-emerald-500"
          >
            Join Room
          </button>
        </form>
      </section>
    </main>
  `;

  return renderLayout({ title: "Santase", body });
}
