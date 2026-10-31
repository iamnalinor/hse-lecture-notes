import { isRouteErrorResponse, Link, useRouteError } from "react-router";

import { paths } from "#web/domain/paths.ts";
import { SiteFooter } from "#web/shared/layout/site-footer.tsx";
import { TopBar } from "#web/shared/layout/top-bar.tsx";
import { applyUpdate, useHasUpdate } from "#web/shared/offline/sw-registration.ts";
import { useDocumentTitle } from "#web/shared/ui/document-title.ts";

import { isNotFound } from "./not-found.ts";

const describe = (error: unknown): string => {
  if (isNotFound(error)) {
    return "Возможно, ссылка устарела: лекцию переименовали или убрали.";
  }
  if (isRouteErrorResponse(error)) {
    return error.statusText;
  }
  if (!navigator.onLine) {
    return "Нет интернета, а эта страница ещё не сохранена офлайн. Открытые раньше конспекты доступны и так, а чтобы сохранить все, нажмите «Скачать все» внизу страницы, когда интернет появится.";
  }
  return error instanceof Error ? error.message : "Что-то пошло не так.";
};

export const RouteError = () => {
  const error = useRouteError();
  const isMissing = isNotFound(error);
  // A tab still on the previous version may ask for files the new one renamed (a lecture slug).
  const hasUpdate = useHasUpdate();
  useDocumentTitle(isMissing ? "Страница не найдена" : "Ошибка");

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <TopBar />
      <main className="mx-auto w-full max-w-[720px] flex-1 px-4 py-16 sm:px-8 sm:py-24">
        <h1 className="text-4xl font-bold">
          {isMissing ? "Такой страницы нет" : "Не получилось открыть страницу"}
        </h1>
        <p className="mt-4 text-xl text-muted">{describe(error)}</p>
        {hasUpdate && (
          <p className="mt-4 text-xl text-muted">
            Сайт обновился, а эта вкладка открыта на старой версии.{" "}
            <button
              className="cursor-pointer font-semibold text-brand underline"
              onClick={applyUpdate}
              type="button"
            >
              Обновить
            </button>
          </p>
        )}
        <Link className="mt-8 inline-block font-semibold" to={paths.home()}>
          На главную →
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
};
