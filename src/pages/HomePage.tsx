import { ArrowRight, SlidersHorizontal, Search } from "lucide-react";
import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import {
  continueItems,
  quickActions,
  recentlyAdded,
  summaryCards,
} from "../lib/homeData";

function HomePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Home"
        subtitle="Local private catalog for Videos, Images, and Performers"
        action={
          <div className="flex w-full items-center gap-3 sm:w-auto">
            <label className="relative block w-full sm:w-[420px]">
              <Search
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                size={19}
              />
              <input
                className="h-12 w-full rounded-lg border border-slate-200 bg-white pl-12 pr-4 text-sm font-medium text-slate-600 outline-none transition placeholder:text-slate-400 focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
                placeholder="Search videos, images, performers..."
                aria-label="Search videos, images, performers"
              />
            </label>
            <button
              type="button"
              className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm"
              aria-label="Search filters placeholder"
            >
              <SlidersHorizontal size={19} />
            </button>
          </div>
        }
      />

      <section className="relative overflow-hidden rounded-lg border border-sakura-100 bg-white">
        <div className="absolute inset-0 bg-gradient-to-r from-white via-white to-sakura-50/80" />
        <div className="relative grid min-h-56 gap-0 lg:grid-cols-[1fr_1fr]">
          <div className="flex flex-col justify-center p-7 lg:p-10">
            <h2 className="text-3xl font-semibold tracking-normal text-slate-950">
              Welcome to Sakurava
            </h2>
            <p className="mt-4 max-w-md text-base leading-7 text-slate-600">
              Manage your local video, image, and performer catalog in one
              private desktop app.
            </p>
            <Link
              to="/videos"
              className="mt-6 inline-flex h-11 w-fit items-center gap-2 rounded-lg bg-sakura-500 px-5 text-sm font-semibold text-white shadow-sm shadow-sakura-200 transition hover:bg-sakura-600"
            >
              Get Started
              <ArrowRight size={17} />
            </Link>
          </div>
          <div className="relative min-h-52 overflow-hidden">
            <div className="absolute -right-8 top-2 h-56 w-80 rotate-[-12deg] rounded-full bg-sakura-100/50 blur-3xl" />
            <div className="absolute right-0 top-1/2 h-2 w-[420px] -translate-y-1/2 rotate-[-24deg] rounded-full bg-rose-300/40" />
            <div className="absolute right-8 top-6 h-2 w-[300px] rotate-[-24deg] rounded-full bg-rose-900/25" />
            <SakuraCluster className="absolute right-10 top-10 scale-110" />
            <SakuraCluster className="absolute right-40 top-24 scale-75 opacity-75" />
            <SakuraCluster className="absolute right-56 top-7 scale-50 opacity-50" />
            <span className="absolute left-10 top-8 size-4 rotate-45 rounded-full bg-sakura-200/50 blur-[1px]" />
            <span className="absolute left-32 top-20 size-3 rotate-45 rounded-full bg-sakura-200/45 blur-[1px]" />
            <span className="absolute bottom-10 left-24 size-5 rotate-45 rounded-full bg-sakura-100/60 blur-[1px]" />
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;

          return (
            <article
              key={card.label}
              className="rounded-lg border border-slate-200 bg-white p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-500">
                    {card.label}
                  </p>
                  <p className="mt-2 text-3xl font-semibold tracking-normal text-slate-950">
                    {card.value}
                  </p>
                </div>
                <div className="flex size-10 items-center justify-center rounded-lg bg-sakura-50 text-sakura-600">
                  <Icon size={20} />
                </div>
              </div>
              <p className="mt-4 text-sm text-slate-500">{card.detail}</p>
            </article>
          );
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-950">
            Quick Actions
          </h2>
          <div className="mt-4 grid gap-3">
            {quickActions.map((action) => {
              const Icon = action.icon;

              return (
                <Link
                  key={action.to}
                  to={action.to}
                  className="flex items-center justify-between rounded-lg border border-slate-200 p-4 transition hover:border-sakura-200 hover:bg-sakura-50"
                >
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">
                      {action.label}
                    </span>
                    <span className="mt-1 block text-sm text-slate-500">
                      {action.detail}
                    </span>
                  </span>
                  <span className="flex size-9 items-center justify-center rounded-lg bg-white text-sakura-600">
                    <Icon size={18} />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-950">
            Continue Cataloging
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {continueItems.map((item) => (
              <div
                key={item}
                className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4"
              >
                <div className="h-16 rounded-md bg-white" />
                <p className="mt-3 text-sm font-medium text-slate-700">
                  {item}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold text-slate-950">
          Recently Added
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {recentlyAdded.map((item) => (
            <div
              key={item}
              className="rounded-lg border border-slate-200 bg-white p-4"
            >
              <div className="aspect-video rounded-md bg-slate-100" />
              <p className="mt-3 text-sm font-medium text-slate-700">{item}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SakuraCluster({ className }: { className: string }) {
  return (
    <div className={["relative size-28", className].join(" ")} aria-hidden="true">
      {[0, 1, 2, 3, 4].map((petal) => (
        <span
          key={petal}
          className={[
            "absolute left-1/2 top-1/2 h-12 w-7 origin-bottom rounded-full bg-gradient-to-b from-sakura-100 to-sakura-300/70 shadow-sm",
            petalClass(petal),
          ].join(" ")}
        />
      ))}
      <span className="absolute left-1/2 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sakura-400/70" />
    </div>
  );
}

function petalClass(index: number) {
  const classes = [
    "-translate-x-1/2 -translate-y-full rotate-0",
    "-translate-x-1/2 -translate-y-full rotate-[72deg]",
    "-translate-x-1/2 -translate-y-full rotate-[144deg]",
    "-translate-x-1/2 -translate-y-full rotate-[216deg]",
    "-translate-x-1/2 -translate-y-full rotate-[288deg]",
  ];

  return classes[index] ?? "";
}

export default HomePage;
