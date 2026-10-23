/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}

/**
 * `pouchdb/dist/pouchdb.js` là bundle trình duyệt của PouchDB (xem ghi chú trong
 * `App.vue`). `@types/pouchdb` chỉ khai báo module `pouchdb`, nên đường dẫn sâu cần
 * khai báo thêm — dùng lại đúng type của entry chính, không tự mô tả lại API.
 */
declare module 'pouchdb/dist/pouchdb.js' {
  import PouchDB from 'pouchdb';
  export default PouchDB;
}

/**
 * `virtual:uno.css` do plugin UnoCSS sinh lúc build. `@unocss/vite@66.11.0` chỉ export
 * `.` và `./client`, không kèm khai báo module, nên khai tại đây.
 */
declare module 'virtual:uno.css';
