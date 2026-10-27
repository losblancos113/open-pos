<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: number | string;
    showText?: boolean;
    class?: string;
  }>(),
  {
    size: 32,
    showText: false,
    class: '',
  }
);
</script>

<template>
  <div class="inline-flex items-center gap-3 select-none" :class="$props.class">
    <!-- OP Nexus Squircle Mark -->
    <svg
      :width="size"
      :height="size"
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      class="shrink-0 rounded-lg shadow-xs"
    >
      <defs>
        <linearGradient id="opTerracottaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#d04a15" />
          <stop offset="100%" stop-color="#b03607" />
        </linearGradient>
        <linearGradient id="opShine" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.15" />
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
        </linearGradient>
      </defs>

      <!-- Squircle Container -->
      <rect x="32" y="32" width="448" height="448" rx="104" ry="104" fill="url(#opTerracottaGrad)" />
      <rect x="32" y="32" width="448" height="448" rx="104" ry="104" fill="url(#opShine)" />

      <!-- OP Monogram Glyph -->
      <g fill="#ffffff" fill-rule="evenodd">
        <path
          d="
            M 276,136
            C 342,136 388,168 388,206
            C 388,244 342,274 276,274
            L 276,324
            C 276,350 252,376 210,376
            C 144,376 94,322 94,256
            C 94,190 144,136 210,136
            Z
            M 210,188
            C 174,188 146,218 146,256
            C 146,294 174,324 210,324
            C 226,324 238,312 238,296
            L 238,216
            C 238,200 226,188 210,188
            Z
            M 276,184
            L 306,184
            C 328,184 342,192 342,206
            C 342,220 328,228 306,228
            L 276,228
            Z
          "
        />
      </g>
      <!-- Active Ledger Pip -->
      <circle cx="338" cy="342" r="22" fill="#ffedd5" />
    </svg>

    <!-- Optional Typography Lockup -->
    <div v-if="showText" class="flex flex-col">
      <div class="flex items-center gap-1.5 leading-none">
        <span class="text-lg font-black tracking-tight text-text">OPEN</span>
        <span class="bg-primary text-primary-contrast text-xs font-extrabold px-1.5 py-0.5 rounded">POS</span>
      </div>
      <span class="text-[10px] text-text-muted font-semibold tracking-wider uppercase mt-0.5">
        Offline-First
      </span>
    </div>
  </div>
</template>
