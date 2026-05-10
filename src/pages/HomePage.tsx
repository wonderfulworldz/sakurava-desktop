import { ArrowRight, Search } from "lucide-react";
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
          <div className="relative w-full sm:w-80">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={17}
            />
            <input
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-600 outline-none transition placeholder:text-slate-400 focus:border-sakura-300 focus:ring-4 focus:ring-sakura-100"
              placeholder="Search catalog..."
              aria-label="Search catalog placeholder"
            />
          </div>
        }
      />

      <section className="overflow-hidden rounded-lg border border-sakura-100 bg-white">
        <div className="grid gap-0 lg:grid-cols-[1.4fr_0.8fr]">
          <div className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sakura-600">
              Static frontend preview
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-normal text-slate-950">
              Start organizing your private catalog locally.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
              This Home screen uses mock counts and placeholder sections while
              the shell and routes are prepared for later batches.
            </p>
            <Link
              to="/videos"
              className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-sakura-500 px-4 text-sm font-semibold text-white shadow-sm shadow-sakura-200 transition hover:bg-sakura-600"
            >
              Get Started
              <ArrowRight size={17} />
            </Link>
          </div>
          <div className="min-h-48 border-t border-sakura-100 bg-sakura-50 p-6 lg:border-l lg:border-t-0">
            <div className="grid h-full grid-cols-2 gap-3">
              <div className="rounded-lg border border-white/80 bg-white/70 p-4" />
              <div className="rounded-lg border border-white/80 bg-white/70 p-4" />
              <div className="rounded-lg border border-white/80 bg-white/70 p-4" />
              <div className="rounded-lg border border-white/80 bg-white/70 p-4" />
            </div>
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

export default HomePage;
