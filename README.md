# happy-writer

`happy-writer` — лёгкий веб-редактор для книжных репозиториев, использующих [book-framework](https://github.com/nedobylskiy/book-framework).

## Что уже есть в MVP

- работа с GitHub через официальный `@octokit/rest`;
- список book-framework проектов: приложение ищет доступные репозитории с `book.config.json`;
- возможность открыть проект вручную по `owner/repository`;
- загрузка глав из `manuscript/chapters` при открытии книги;
- локальная копия текста в `localStorage`, чтобы изменения не пропадали при проблемах с сетью;
- автоматическая отправка изменений обратно в `manuscript/chapters`;
- создание новой главы;
- адаптивное меню глав:
  - постоянная боковая панель на широком экране;
  - drawer на телефоне;
  - открытие drawer свайпом вправо от левого края;
- простой rich-text редактор, который сериализуется обратно в синтаксис book-framework;
- `---` трактуется как разрыв сцены book-framework, а не как Markdown `<hr>`;
- поддержка базовых конструкций: `##`–`######`, `**bold**`, `*italic*`, inline code, fenced code, ссылки и разрыв сцены;
- панель форматирования сверху на широких экранах и снизу на телефоне.

## Запуск

```bash
npm install
npm run dev
```

Для production-сборки:

```bash
npm run build
npm run preview
```

## GitHub token

При первом запуске приложение попросит GitHub Personal Access Token. Токен хранится только в `localStorage` текущего браузера и передаётся напрямую GitHub API через Octokit.

Для работы с private-репозиториями fine-grained token должен иметь доступ к нужным репозиториям и как минимум:

- **Contents: Read and write**;
- **Metadata: Read**.

Для MVP отдельного backend нет. Это намеренно: приложение можно запускать как обычную статическую SPA.

> Важно: хранение GitHub token в browser localStorage подходит для личного/экспериментального приложения, но не является целевой схемой для публичного multi-user сервиса. Для такого варианта лучше добавить GitHub OAuth/App и серверную сессию.

## Формат книги

Проект считается книгой, если в корне есть `book.config.json`.

Главы читаются и записываются сюда:

```text
manuscript/chapters/
```

Имена файлов сортируются с numeric-aware сортировкой, поэтому `2...` идёт раньше `10...`.

Редактор не использует CommonMark как источник истины. Его задача — сохранить небольшой переносимый синтаксис `book-framework`. В частности, отдельная строка:

```text
---
```

в интерфейсе отображается как разрыв сцены и при сохранении снова превращается именно в `---`.

## Структура

```text
src/
  App.tsx         UI проектов, глав, local cache и GitHub sync
  BookEditor.tsx  rich editor + преобразование book-framework syntax ⇄ DOM
  github.ts       работа с GitHub через @octokit/rest
  storage.ts      локальные черновики и настройки
  styles.css      desktop/mobile layout
```

## Следующие логичные шаги

Следующий слой после MVP: нормальная очередь синхронизации для нескольких одновременно изменённых глав, управление `book.config.json` при создании/переименовании глав, изображения/assets, сноски отдельным UI, conflict resolution по SHA и GitHub OAuth вместо ручного PAT.
