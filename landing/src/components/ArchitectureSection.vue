<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from '../i18n';

const { t } = useI18n();

// Interactive switch to demonstrate offline resilience
const isInternetSevered = ref(true);
</script>

<template>
  <section id="architecture" class="py-20 md:py-28 bg-surface">
    <div class="section-container">
      <!-- Section Header -->
      <div class="mx-auto max-w-3xl text-center mb-16">
        <div class="inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent/5 px-3 py-1 text-xs font-semibold text-accent mb-3">
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
            <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
            <line x1="6" y1="6" x2="6.01" y2="6" />
            <line x1="6" y1="18" x2="6.01" y2="18" />
          </svg>
          {{ t.architecture.badge }}
        </div>
        <h2 class="text-3xl font-extrabold tracking-tight text-text sm:text-4xl">
          {{ t.architecture.title }}
        </h2>
        <p class="mt-4 text-base text-text-muted leading-relaxed">
          {{ t.architecture.subtitle }}
        </p>
      </div>

      <!-- Interactive Network Diagram -->
      <div class="mx-auto max-w-5xl rounded-2xl border border-border bg-bg-subtle p-6 md:p-8 shadow-card">
        <!-- Interactive Mode Switcher -->
        <div class="flex flex-col sm:flex-row items-center justify-between gap-4 pb-6 border-b border-border">
          <div class="flex items-center gap-3">
            <span class="text-xs font-bold uppercase tracking-wider text-text-muted">Mô Phỏng Trạng Thái Mạng:</span>
            <button
              type="button"
              class="btn text-xs font-bold transition-all px-3.5 py-1.5"
              :class="isInternetSevered ? 'bg-danger text-white shadow-soft' : 'bg-surface border border-border text-text-muted hover:text-text'"
              @click="isInternetSevered = !isInternetSevered"
            >
              <span class="h-2 w-2 rounded-full" :class="isInternetSevered ? 'bg-white animate-pulse' : 'bg-success'"></span>
              {{ isInternetSevered ? '⚠️ Internet Bị Đứt (Mất Mạng Ngoài)' : '✓ Internet Đang Có' }}
            </button>
          </div>

          <!-- Real-time Status Badge -->
          <div class="flex items-center gap-2 text-xs font-mono">
            <span class="text-text-muted">Hệ Thống Open POS:</span>
            <span class="rounded-full bg-success-subtle text-success border border-success/30 px-2.5 py-0.5 font-bold flex items-center gap-1.5">
              <span class="h-1.5 w-1.5 rounded-full bg-success"></span>
              100% Hoạt Động (0 Gián Đoạn)
            </span>
          </div>
        </div>

        <!-- Network Diagram Graphic -->
        <div class="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6 relative">
          <!-- External Cloud Gateway Indicator -->
          <div class="md:col-span-3 rounded-xl border p-4 text-center transition-all duration-300"
            :class="isInternetSevered ? 'border-danger/30 bg-danger/5 text-danger' : 'border-success/30 bg-success/5 text-success'">
            <div class="flex items-center justify-center gap-2 text-xs font-mono font-bold">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
              </svg>
              <span>Đường Truyền Internet Ra Ngoài (ISP Cloud)</span>
              <span>—</span>
              <span class="font-extrabold uppercase">
                {{ isInternetSevered ? '❌ MẤT KẾT NỐI (Cloud POS Sẽ Chết)' : '✓ ĐANG KẾT NỐI' }}
              </span>
            </div>
          </div>

          <!-- Node 1: Main Terminal (Hub) -->
          <div class="card-base p-5 relative border-2 border-primary/40 bg-surface">
            <div class="absolute -top-3 left-4 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold text-primary-contrast uppercase tracking-wider">
              Central Node
            </div>
            <div class="mt-2 flex items-center gap-3">
              <div class="rounded-lg bg-primary-subtle p-2 text-primary">
                <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              </div>
              <div>
                <h4 class="font-bold text-sm text-text">{{ t.architecture.nodes.hubTitle }}</h4>
                <span class="font-mono text-[11px] text-primary font-semibold">Port :5984 (PouchDB)</span>
              </div>
            </div>
            <p class="mt-3 text-xs text-text-muted leading-relaxed">
              {{ t.architecture.nodes.hubDesc }}
            </p>
            <div class="mt-4 pt-3 border-t border-border flex items-center justify-between text-[11px] font-mono text-success">
              <span>● Local Storage OK</span>
              <span>● LAN Server OK</span>
            </div>
          </div>

          <!-- Node 2: Waiter Tablet -->
          <div class="card-base p-5 relative bg-surface">
            <div class="mt-2 flex items-center gap-3">
              <div class="rounded-lg bg-accent/10 p-2 text-accent">
                <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
                  <line x1="12" y1="18" x2="12.01" y2="18" />
                </svg>
              </div>
              <div>
                <h4 class="font-bold text-sm text-text">{{ t.architecture.nodes.waiterTitle }}</h4>
                <span class="font-mono text-[11px] text-accent font-semibold">Wi-Fi Client (Order tại bàn)</span>
              </div>
            </div>
            <p class="mt-3 text-xs text-text-muted leading-relaxed">
              {{ t.architecture.nodes.waiterDesc }}
            </p>
            <div class="mt-4 pt-3 border-t border-border flex items-center justify-between text-[11px] font-mono text-success">
              <span>● Đổi món <10ms</span>
              <span>● Mesh Sync OK</span>
            </div>
          </div>

          <!-- Node 3: Kitchen Display & Printer -->
          <div class="card-base p-5 relative bg-surface">
            <div class="mt-2 flex items-center gap-3">
              <div class="rounded-lg bg-warning/10 p-2 text-warning">
                <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
              </div>
              <div>
                <h4 class="font-bold text-sm text-text">{{ t.architecture.nodes.kitchenTitle }}</h4>
                <span class="font-mono text-[11px] text-warning font-semibold">ESC/POS 80mm / KDS</span>
              </div>
            </div>
            <p class="mt-3 text-xs text-text-muted leading-relaxed">
              {{ t.architecture.nodes.kitchenDesc }}
            </p>
            <div class="mt-4 pt-3 border-t border-border flex items-center justify-between text-[11px] font-mono text-success">
              <span>● In nhiệt tự động</span>
              <span>● USB/LAN/BT OK</span>
            </div>
          </div>
        </div>

        <!-- Explanatory Banner below diagram -->
        <div class="mt-8 rounded-xl bg-surface p-4 border border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success-subtle text-success">
              <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </span>
            <div>
              <div class="font-bold text-xs sm:text-sm text-text">{{ t.architecture.features[0]?.title }}</div>
              <div class="text-[11px] text-text-muted">{{ t.architecture.features[0]?.desc }}</div>
            </div>
          </div>
          <span class="shrink-0 font-mono text-xs font-bold text-success bg-success-subtle px-3 py-1.5 rounded-lg border border-success/20">
            99.999% Operational Uptime
          </span>
        </div>
      </div>

      <!-- 3 Pillars Grid -->
      <div class="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div v-for="(feat, index) in t.architecture.features" :key="index" class="card-base p-6">
          <div class="flex items-center gap-2 mb-3">
            <span class="flex h-7 w-7 items-center justify-center rounded-md bg-primary-subtle text-primary font-mono text-xs font-bold">
              0{{ index + 1 }}
            </span>
            <h3 class="font-bold text-base text-text">{{ feat.title }}</h3>
          </div>
          <p class="text-xs sm:text-sm text-text-muted leading-relaxed">
            {{ feat.desc }}
          </p>
        </div>
      </div>
    </div>
  </section>
</template>
