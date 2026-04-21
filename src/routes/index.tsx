import { $, component$, useStore, useVisibleTask$ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import {
  DEFAULT_FORM,
  FLOOR_STATS,
  HANDLING_OPTIONS,
  LANES,
  SERVICES,
  formatTime,
  getFulfillmentScore,
  getHandling,
  getLane,
  getService,
  loadDraft,
  loadTickets,
  makeLog,
  makeTicket,
  saveDraft,
  saveTickets,
  simulateCarrierSync,
  validateFulfillment,
} from "~/lib/packflow";
import type {
  FulfillmentForm,
  FulfillmentLog,
  FulfillmentTicket,
  TicketStatus,
} from "~/lib/packflow";

function getStatusLabel(status: TicketStatus): string {
  const labels: Record<TicketStatus, string> = {
    draft: "Draft",
    syncing: "Routing",
    staged: "Staged",
    failed: "Retry",
  };

  return labels[status];
}

function getStatusClass(status: TicketStatus): string {
  const classes: Record<TicketStatus, string> = {
    draft: "border-ink/20 bg-paper text-ink",
    syncing: "border-cargo bg-cargo text-paper",
    staged: "border-reef bg-reef text-paper",
    failed: "border-danger bg-danger text-paper",
  };

  return classes[status];
}

export default component$(() => {
  const state = useStore({
    form: { ...DEFAULT_FORM } as FulfillmentForm,
    tickets: [] as FulfillmentTicket[],
    logs: [
      makeLog(
        "Static floor rendered",
        "The fulfillment board ships as HTML before any packing interaction wakes up.",
        "draft",
      ),
      makeLog(
        "Optimistic queue armed",
        "New pack tickets will appear instantly, then reconcile with the mock carrier.",
        "draft",
      ),
    ] as FulfillmentLog[],
    error: "",
    failNextSync: false,
    copied: false,
    draftRestored: false,
  });

  // Browser storage is client-only; the static shell remains useful before this task runs.
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(() => {
    const restoredDraft = loadDraft();
    const restoredTickets = loadTickets();

    if (restoredDraft) {
      state.form = restoredDraft;
      state.draftRestored = true;
    }

    if (restoredTickets.length > 0) {
      state.tickets = restoredTickets;
    }

    if (restoredDraft || restoredTickets.length > 0) {
      state.logs = [
        makeLog(
          "Local pack state restored",
          `${restoredDraft ? "Draft" : "No draft"} and ${restoredTickets.length} ticket${restoredTickets.length === 1 ? "" : "s"} resumed from this browser.`,
          "staged",
        ),
        ...state.logs,
      ].slice(0, 6);
    }
  });

  const persistDraft$ = $(() => {
    saveDraft({ ...state.form });
  });

  const pushLog$ = $((label: string, detail: string, status: TicketStatus) => {
    state.logs = [makeLog(label, detail, status), ...state.logs].slice(0, 6);
  });

  const syncTicket$ = $(async (ticketId: string, shouldFail: boolean) => {
    try {
      await simulateCarrierSync(shouldFail);

      state.tickets = state.tickets.map((ticket) =>
        ticket.id === ticketId
          ? {
              ...ticket,
              status: "staged",
              updatedAt: new Date().toISOString(),
            }
          : ticket,
      );
      saveTickets(state.tickets);
      await pushLog$(
        "Carrier ping confirmed",
        "The optimistic pack ticket stayed in place and changed to staged.",
        "staged",
      );
    } catch (error) {
      state.tickets = state.tickets.map((ticket) =>
        ticket.id === ticketId
          ? {
              ...ticket,
              status: "failed",
              updatedAt: new Date().toISOString(),
            }
          : ticket,
      );
      saveTickets(state.tickets);
      await pushLog$(
        "Carrier ping held",
        error instanceof Error
          ? error.message
          : "The pack ticket stayed visible and can be retried.",
        "failed",
      );
    }
  });

  const queuePack$ = $(async () => {
    const validationError = validateFulfillment(state.form);
    state.error = validationError ?? "";

    if (validationError) {
      await pushLog$("Pack check", validationError, "failed");
      return;
    }

    const ticket = makeTicket(state.form, state.tickets.length);
    state.tickets = [ticket, ...state.tickets];
    saveTickets(state.tickets);
    saveDraft({ ...state.form });
    await pushLog$(
      "Optimistic pack ticket",
      `${ticket.dockCode} appeared on the board before the mock carrier answered.`,
      "syncing",
    );

    const shouldFail = state.failNextSync;
    state.failNextSync = false;
    await syncTicket$(ticket.id, shouldFail);
  });

  const retryTicket$ = $(async (ticketId: string) => {
    state.tickets = state.tickets.map((ticket) =>
      ticket.id === ticketId
        ? {
            ...ticket,
            status: "syncing",
            attempts: ticket.attempts + 1,
            updatedAt: new Date().toISOString(),
          }
        : ticket,
    );
    saveTickets(state.tickets);
    await pushLog$(
      "Retry staged",
      "The pack ticket returned to routing without leaving the board.",
      "syncing",
    );
    await syncTicket$(ticketId, false);
  });

  const clearBoard$ = $(() => {
    state.tickets = [];
    saveTickets([]);
    state.logs = [
      makeLog("Board cleared", "All local pack tickets were removed.", "draft"),
      ...state.logs,
    ].slice(0, 6);
  });

  const resetDraft$ = $(async () => {
    state.form = { ...DEFAULT_FORM };
    saveDraft(state.form);
    state.error = "";
    state.draftRestored = false;
    await pushLog$(
      "Bench reset",
      "The packing bench returned to defaults.",
      "draft",
    );
  });

  const copyTicket$ = $(async () => {
    const latest = state.tickets[0];

    if (!latest || typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }

    const text = `Packflow ${latest.dockCode}: ${latest.summary}`;
    await navigator.clipboard.writeText(text);
    state.copied = true;
    await pushLog$("Ticket copied", text, "staged");
    window.setTimeout(() => {
      state.copied = false;
    }, 1300);
  });

  const score = getFulfillmentScore(state.form);
  const selectedLane = getLane(state.form.lane);
  const selectedService = getService(state.form.service);
  const selectedHandling = getHandling(state.form.handling);
  const latestTicket = state.tickets[0];
  const stagedCount = state.tickets.filter(
    (ticket) => ticket.status === "staged",
  ).length;
  const failedCount = state.tickets.filter(
    (ticket) => ticket.status === "failed",
  ).length;

  return (
    <main class="bg-yard text-ink min-h-screen overflow-x-hidden">
      <section class="mx-auto max-w-[1600px] px-3 py-4 sm:px-5 lg:px-8 xl:px-10">
        <header class="floor-hero border-ink bg-ink text-paper relative overflow-hidden rounded-[2rem] border p-5 shadow-[12px_12px_0_rgba(16,25,35,0.13)] sm:rounded-[2.7rem] sm:p-8 lg:p-10 xl:p-12">
          <div class="relative z-10 grid gap-8 2xl:grid-cols-[minmax(0,0.72fr)_minmax(24rem,0.28fr)] 2xl:items-end">
            <div>
              <p class="text-cargo font-mono text-xs tracking-[0.42em] uppercase">
                Packflow
              </p>
              <h1 class="font-display mt-5 max-w-6xl text-5xl leading-[0.9] font-black tracking-[-0.07em] sm:text-7xl lg:text-8xl 2xl:text-9xl">
                Pack orders first. Ask the carrier second.
              </h1>
              <p class="text-paper/68 mt-6 max-w-3xl text-base leading-8">
                A static Qwik fulfillment board where a pack ticket lands in the
                queue immediately, then the mock carrier confirms or asks for a
                retry.
              </p>
            </div>

            <div class="route-map border-paper/14 bg-paper/8 rounded-[2rem] border p-4 sm:p-5">
              <div class="grid gap-3">
                <div class="flex items-end justify-between gap-4">
                  <div>
                    <p class="text-paper/45 font-mono text-[11px] tracking-[0.24em] uppercase">
                      floor score
                    </p>
                    <p class="font-display mt-3 text-7xl leading-none font-black">
                      {score}
                    </p>
                  </div>
                  <p class="text-paper/58 max-w-32 pb-2 text-right text-xs leading-5">
                    {state.draftRestored ? "draft restored" : "live bench"}
                  </p>
                </div>

                <div class="grid grid-cols-2 gap-3">
                  {FLOOR_STATS.map((stat) => (
                    <div
                      key={stat.label}
                      class="border-paper/12 rounded-2xl border px-4 py-3"
                    >
                      <p class="text-paper/38 font-mono text-[10px] tracking-[0.18em] uppercase">
                        {stat.label}
                      </p>
                      <p class="text-cargo mt-2 text-sm font-black">
                        {stat.value}
                      </p>
                    </div>
                  ))}
                  <div class="bg-cargo text-ink border-cargo rounded-2xl border px-4 py-3">
                    <p class="font-mono text-[10px] tracking-[0.18em] uppercase">
                      active bay
                    </p>
                    <p class="mt-2 text-sm font-black">{selectedLane.bay}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <section class="mt-6 grid gap-6 2xl:grid-cols-[minmax(0,1fr)_28rem] 2xl:items-start">
          <section class="dispatch-board border-ink bg-paper relative overflow-hidden rounded-[2rem] border p-4 shadow-[12px_12px_0_rgba(16,25,35,0.12)] sm:rounded-[2.7rem] sm:p-7 lg:p-9 xl:p-10">
            <div class="relative z-10 grid gap-7">
              <header class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.28fr)] xl:items-start">
                <div>
                  <p class="text-ink/45 font-mono text-xs tracking-[0.42em] uppercase">
                    fulfillment floor
                  </p>
                  <h2 class="font-display mt-4 max-w-6xl text-4xl leading-[0.92] font-black tracking-[-0.06em] sm:text-6xl lg:text-7xl xl:text-8xl">
                    Build a local pack ticket before the network blinks.
                  </h2>
                </div>

                <aside class="notch-note border-ink bg-yard rounded-[1.7rem] border p-4">
                  <p class="text-ink/45 font-mono text-xs tracking-[0.24em] uppercase">
                    Qwik angle
                  </p>
                  <p class="text-ink/68 mt-3 text-sm leading-6">
                    The board is static HTML first. Input, queue, retry, and
                    storage handlers load only when the operator touches them.
                  </p>
                </aside>
              </header>

              <section class="belt-strip border-ink bg-ink text-paper rounded-[2rem] border p-4 sm:p-5">
                <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p class="text-cargo font-mono text-xs tracking-[0.32em] uppercase">
                      lane selector
                    </p>
                    <h3 class="mt-2 text-2xl font-black tracking-[-0.04em]">
                      Route the package by aisle.
                    </h3>
                  </div>
                  <p class="text-paper/55 max-w-md text-sm leading-6">
                    Selected lane reserves the visual bay without hiding the
                    rest of the floor.
                  </p>
                </div>

                <div class="mt-5 grid gap-3 md:grid-cols-4">
                  {LANES.map((lane) => (
                    <button
                      key={lane.key}
                      type="button"
                      onClick$={async () => {
                        state.form.lane = lane.key;
                        await persistDraft$();
                      }}
                      class={`rounded-[1.5rem] border px-4 py-5 text-left transition ${
                        state.form.lane === lane.key
                          ? "border-cargo bg-cargo text-ink"
                          : "border-paper/15 bg-paper/6 text-paper hover:border-paper/60"
                      }`}
                    >
                      <span class="font-mono text-[10px] tracking-[0.24em] uppercase">
                        {lane.bay}
                      </span>
                      <span class="mt-4 block text-lg font-black">
                        {lane.label}
                      </span>
                      <span class="mt-1 block text-sm opacity-68">
                        {lane.cue}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <form
                preventdefault:submit
                onSubmit$={queuePack$}
                class="grid min-w-0 gap-5"
              >
                <section class="border-ink rounded-[2rem] border bg-white p-5 sm:p-7">
                  <div class="border-ink/18 flex flex-col gap-3 border-b border-dashed pb-5 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p class="text-ink/45 font-mono text-xs tracking-[0.3em] uppercase">
                        packing bench
                      </p>
                      <h3 class="mt-2 text-3xl font-black tracking-[-0.04em]">
                        Who is this pack for?
                      </h3>
                    </div>
                    <span class="border-ink/20 bg-yard rounded-full border px-3 py-1 font-mono text-[10px] tracking-[0.16em] uppercase">
                      {selectedLane.label}
                    </span>
                  </div>

                  <div class="mt-6 grid gap-4 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1fr)_minmax(10rem,0.26fr)]">
                    <label class="grid min-w-0 gap-2">
                      <span class="text-ink/45 font-mono text-xs tracking-[0.22em] uppercase">
                        Owner email
                      </span>
                      <input
                        type="email"
                        class="bg-yard focus:border-ink border-ink/18 min-w-0 rounded-2xl border px-4 py-4 outline-none"
                        placeholder="ops@packflow.dev"
                        value={state.form.email}
                        onInput$={async (_, target) => {
                          state.form.email = target.value;
                          await persistDraft$();
                        }}
                      />
                    </label>

                    <label class="grid min-w-0 gap-2">
                      <span class="text-ink/45 font-mono text-xs tracking-[0.22em] uppercase">
                        Recipient
                      </span>
                      <input
                        class="bg-yard focus:border-ink border-ink/18 min-w-0 rounded-2xl border px-4 py-4 outline-none"
                        placeholder="North Pier Studio"
                        value={state.form.recipient}
                        onInput$={async (_, target) => {
                          state.form.recipient = target.value;
                          await persistDraft$();
                        }}
                      />
                    </label>

                    <label class="grid min-w-0 gap-2">
                      <span class="text-ink/45 font-mono text-xs tracking-[0.22em] uppercase">
                        Parcels
                      </span>
                      <input
                        type="number"
                        min="1"
                        max="12"
                        class="bg-yard focus:border-ink border-ink/18 min-w-0 rounded-2xl border px-4 py-4 outline-none"
                        value={state.form.parcelCount}
                        onInput$={async (_, target) => {
                          const parsed = Number.parseInt(target.value, 10);
                          state.form.parcelCount = Number.isFinite(parsed)
                            ? Math.min(12, Math.max(1, parsed))
                            : 1;
                          await persistDraft$();
                        }}
                      />
                    </label>
                  </div>
                </section>

                <section class="grid gap-5 xl:grid-cols-[minmax(0,0.58fr)_minmax(18rem,0.42fr)]">
                  <div class="border-ink rounded-[2rem] border bg-white p-5 sm:p-7">
                    <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p class="text-ink/45 font-mono text-xs tracking-[0.3em] uppercase">
                          carrier service
                        </p>
                        <h3 class="mt-2 text-2xl font-black tracking-[-0.04em]">
                          Choose the pickup tempo.
                        </h3>
                      </div>
                      <span class="text-ink/45 font-mono text-xs tracking-[0.18em] uppercase">
                        {selectedService.eta}
                      </span>
                    </div>

                    <div class="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-1">
                      {SERVICES.map((service) => (
                        <button
                          key={service.key}
                          type="button"
                          onClick$={async () => {
                            state.form.service = service.key;
                            await persistDraft$();
                          }}
                          class={`rounded-2xl border px-4 py-4 text-left transition ${
                            state.form.service === service.key
                              ? "border-reef bg-reef text-paper"
                              : "border-ink/18 bg-yard text-ink hover:border-ink"
                          }`}
                        >
                          <span class="block text-base font-black">
                            {service.label}
                          </span>
                          <span class="mt-1 block text-sm opacity-68">
                            {service.eta}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div class="border-ink bg-sky text-ink rounded-[2rem] border p-5 sm:p-7">
                    <p class="text-ink/45 font-mono text-xs tracking-[0.3em] uppercase">
                      handling
                    </p>
                    <div class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                      {HANDLING_OPTIONS.map((handling) => (
                        <button
                          key={handling.key}
                          type="button"
                          onClick$={async () => {
                            state.form.handling = handling.key;
                            await persistDraft$();
                          }}
                          class={`rounded-2xl border px-4 py-4 text-left transition ${
                            state.form.handling === handling.key
                              ? "border-ink bg-ink text-paper"
                              : "border-ink/18 text-ink hover:border-ink bg-white/55"
                          }`}
                        >
                          <span class="block text-base font-black">
                            {handling.label}
                          </span>
                          <span class="mt-1 block text-sm opacity-68">
                            {handling.detail}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </section>

                <section class="border-ink rounded-[2rem] border bg-white p-5 sm:p-7">
                  <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.36fr)]">
                    <label class="grid min-w-0 gap-2">
                      <span class="text-ink/45 font-mono text-xs tracking-[0.22em] uppercase">
                        Packing note
                      </span>
                      <textarea
                        class="bg-yard focus:border-ink border-ink/18 min-h-40 min-w-0 resize-none rounded-2xl border px-4 py-4 outline-none"
                        placeholder="Pad the prototype tray and keep the orange seal visible."
                        value={state.form.note}
                        onInput$={async (_, target) => {
                          state.form.note = target.value;
                          await persistDraft$();
                        }}
                      />
                    </label>

                    <div class="grid content-start gap-4">
                      <div class="border-ink bg-cargo text-ink rounded-2xl border p-5">
                        <p class="font-mono text-[11px] tracking-[0.24em] uppercase">
                          readiness
                        </p>
                        <p class="font-display mt-2 text-7xl leading-none font-black">
                          {score}
                        </p>
                        <p class="mt-3 text-sm font-bold">
                          {selectedHandling.label} in bay {selectedLane.bay}
                        </p>
                      </div>

                      <label class="flex items-center gap-3 text-sm font-bold">
                        <input
                          type="checkbox"
                          checked={state.failNextSync}
                          onChange$={(_, target) =>
                            (state.failNextSync = target.checked)
                          }
                          class="accent-ink h-5 w-5"
                        />
                        fail next carrier ping
                      </label>

                      <button
                        type="submit"
                        class="bg-ink text-paper border-ink rounded-2xl border px-5 py-5 text-sm font-black tracking-[0.18em] uppercase transition hover:-translate-y-0.5"
                      >
                        Queue pack
                      </button>
                    </div>
                  </div>

                  {state.error && (
                    <p class="border-danger bg-danger/10 text-danger mt-4 rounded-2xl border px-4 py-3 text-sm font-bold">
                      {state.error}
                    </p>
                  )}
                </section>
              </form>
            </div>
          </section>

          <aside class="grid content-start gap-6 self-start xl:grid-cols-2 2xl:grid-cols-1">
            <section class="border-ink rounded-[2rem] border bg-white p-5 shadow-[10px_10px_0_rgba(16,25,35,0.12)] sm:p-6">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <p class="text-ink/45 font-mono text-xs tracking-[0.32em] uppercase">
                    optimistic queue
                  </p>
                  <h2 class="font-display mt-2 text-4xl leading-none font-black tracking-[-0.05em] sm:text-5xl">
                    Ticket lands first.
                  </h2>
                </div>
                <button
                  type="button"
                  onClick$={clearBoard$}
                  class="border-ink/20 text-ink/55 rounded-full border px-3 py-1 text-xs font-black tracking-[0.12em] uppercase"
                >
                  clear
                </button>
              </div>

              <div class="mt-5 grid grid-cols-3 gap-2">
                <div class="border-ink/18 bg-yard rounded-2xl border p-3">
                  <p class="text-ink/45 font-mono text-[10px] tracking-[0.18em] uppercase">
                    all
                  </p>
                  <p class="text-2xl font-black">{state.tickets.length}</p>
                </div>
                <div class="border-ink/18 bg-yard rounded-2xl border p-3">
                  <p class="text-ink/45 font-mono text-[10px] tracking-[0.18em] uppercase">
                    staged
                  </p>
                  <p class="text-2xl font-black">{stagedCount}</p>
                </div>
                <div class="border-ink/18 bg-yard rounded-2xl border p-3">
                  <p class="text-ink/45 font-mono text-[10px] tracking-[0.18em] uppercase">
                    retry
                  </p>
                  <p class="text-2xl font-black">{failedCount}</p>
                </div>
              </div>

              <div class="mt-5">
                {latestTicket ? (
                  <article class="ticket-card border-ink bg-yard rounded-[1.6rem] border p-4">
                    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between 2xl:flex-col">
                      <div>
                        <p class="text-ink/45 font-mono text-xs tracking-[0.2em] uppercase">
                          {latestTicket.dockCode}
                        </p>
                        <h3 class="mt-1 text-xl font-black">
                          {latestTicket.recipient}
                        </h3>
                      </div>
                      <span
                        class={`self-start rounded-full border px-3 py-1 text-xs font-black ${getStatusClass(
                          latestTicket.status,
                        )}`}
                      >
                        {getStatusLabel(latestTicket.status)}
                      </span>
                    </div>

                    <p class="text-ink/65 mt-3 text-sm break-all">
                      {latestTicket.email}
                    </p>
                    <p class="text-ink/70 mt-3 text-sm leading-6">
                      {latestTicket.summary}
                    </p>

                    <div class="text-ink/45 mt-4 grid grid-cols-2 gap-2 font-mono text-[11px] tracking-[0.14em] uppercase">
                      <span>{getLane(latestTicket.lane).label}</span>
                      <span class="text-right">
                        attempt {latestTicket.attempts}
                      </span>
                    </div>

                    {latestTicket.status === "failed" && (
                      <button
                        type="button"
                        onClick$={() => retryTicket$(latestTicket.id)}
                        class="bg-danger text-paper border-danger mt-4 w-full rounded-2xl border px-4 py-3 text-sm font-black tracking-[0.14em] uppercase"
                      >
                        Retry carrier ping
                      </button>
                    )}
                  </article>
                ) : (
                  <p class="border-ink/25 bg-yard text-ink/60 rounded-[1.5rem] border border-dashed p-5 text-sm leading-6">
                    Queue a pack and the ticket appears here immediately, before
                    the mock carrier returns a result.
                  </p>
                )}
              </div>

              <div class="mt-5 grid gap-2 sm:grid-cols-2 2xl:grid-cols-1">
                <button
                  type="button"
                  onClick$={copyTicket$}
                  class="bg-cargo border-ink text-ink rounded-2xl border px-4 py-3 text-sm font-black tracking-[0.14em] uppercase"
                >
                  {state.copied ? "Copied" : "Copy ticket"}
                </button>
                <button
                  type="button"
                  onClick$={resetDraft$}
                  class="border-ink/20 text-ink/60 rounded-2xl border bg-white px-4 py-3 text-sm font-black tracking-[0.14em] uppercase"
                >
                  Reset bench
                </button>
              </div>
            </section>

            <section class="border-ink bg-paper rounded-[2rem] border p-5 sm:p-6">
              <p class="text-ink/45 font-mono text-xs tracking-[0.32em] uppercase">
                floor log
              </p>
              <div class="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-1">
                {state.logs.map((log) => (
                  <article key={log.id} class="border-ink/18 border-l-4 pl-4">
                    <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <h3 class="font-black tracking-[-0.03em]">{log.label}</h3>
                      <span
                        class={`self-start rounded-full border px-2 py-0.5 text-[10px] font-black ${getStatusClass(
                          log.status,
                        )}`}
                      >
                        {getStatusLabel(log.status)}
                      </span>
                    </div>
                    <p class="text-ink/60 mt-1 text-sm leading-5">
                      {log.detail}
                    </p>
                    <p class="text-ink/35 mt-2 font-mono text-[10px] tracking-[0.18em] uppercase">
                      {formatTime(log.createdAt)}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          </aside>
        </section>
      </section>
    </main>
  );
});

export const head: DocumentHead = {
  title: "Packflow | Qwik Fulfillment Board",
  meta: [
    {
      name: "description",
      content:
        "Static Qwik fulfillment board with optimistic packing tickets, local draft recovery, retryable mock carrier sync, Tailwind CSS 4, and Netlify-ready static output.",
    },
  ],
};
