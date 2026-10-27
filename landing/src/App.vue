<script setup lang="ts">
import Navbar from './components/Navbar.vue';
import HeroSection from './components/HeroSection.vue';
import PosSimulator from './components/PosSimulator.vue';
import ArchitectureSection from './components/ArchitectureSection.vue';
import FeatureGrid from './components/FeatureGrid.vue';
import ComparisonSection from './components/ComparisonSection.vue';
import PricingFreedomSection from './components/PricingFreedomSection.vue';
import FaqSection from './components/FaqSection.vue';
import CtaSection from './components/CtaSection.vue';
import FooterSection from './components/FooterSection.vue';
</script>

<template>
  <div class="min-h-screen flex flex-col bg-bg text-text antialiased">
    <Navbar />
    <main class="flex-1">
      <HeroSection />
      <PosSimulator />
      <ArchitectureSection />
      <FeatureGrid />
      <ComparisonSection />
      <PricingFreedomSection />
      <FaqSection />
      <CtaSection />
    </main>
    <FooterSection />
  </div>
</template>
