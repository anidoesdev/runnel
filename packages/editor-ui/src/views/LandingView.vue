<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();

function goToLogin(): void {
  void router.push({ name: 'login' });
}

const year = new Date().getFullYear();
</script>

<template>
  <div class="bg-background min-h-screen flex flex-col text-on-surface antialiased">
    <header class="w-full h-16 flex justify-between items-center px-margin-page bg-surface-container-lowest border-b border-surface-variant sticky top-0 z-50 shadow-sm">
      <div class="flex items-center gap-2 text-headline-md font-headline-md font-bold text-on-surface tracking-tight">
        <span class="material-symbols-outlined text-primary" style="font-variation-settings: 'FILL' 1">schema</span>
        Runnel
      </div>
      <div class="flex gap-4">
        <button type="button" class="font-label-md text-label-md text-on-surface-variant hover:text-on-surface hover:bg-surface-container px-4 py-2 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" @click="goToLogin">
          Sign In
        </button>
        <button
          type="button"
          class="bg-primary text-on-primary px-4 py-2 rounded-full font-label-md text-label-md hover:bg-secondary active:scale-[0.97] transition-all shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          @click="goToLogin"
        >
          Start Building
        </button>
      </div>
    </header>

    <main class="flex-grow flex flex-col items-center w-full max-w-[1440px] mx-auto">
      <!-- Hero -->
      <section class="w-full px-margin-page py-24 md:py-32 flex flex-col items-center text-center relative overflow-hidden">
        <div class="absolute inset-0 grid-bg z-0 pointer-events-none"></div>
        <div class="z-10 max-w-3xl flex flex-col items-center gap-6">
          <div class="inline-flex items-center gap-2 px-3 py-1 bg-surface-base border border-border-muted text-primary rounded-full font-label-sm text-label-sm uppercase tracking-wider mb-2">
            <span class="material-symbols-outlined text-[14px]">auto_awesome</span>
            Runnel v2.0 is Live
          </div>
          <h1 class="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface mb-2">
            Automate with Precision.<br />
            <span class="text-primary">Execute with Confidence.</span>
          </h1>
          <p class="font-body-lg text-body-lg text-on-surface-variant max-w-2xl mb-8">
            The modern, node-based automation platform designed for engineering teams. Build complex workflows with visual clarity, native expressions, and zero compromises.
          </p>
          <div class="flex gap-4 mb-16">
            <button
              type="button"
              class="bg-primary text-on-primary px-6 py-3 rounded-full font-label-md text-label-md hover:bg-secondary active:scale-[0.97] transition-all shadow-sm hover:shadow-md flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              @click="goToLogin"
            >
              Start Building Free
              <span class="material-symbols-outlined text-[16px]">arrow_forward</span>
            </button>
            <button type="button" class="bg-transparent border border-outline text-on-surface-variant px-6 py-3 rounded-full font-label-md text-label-md hover:bg-surface-container hover:border-on-surface-variant active:scale-[0.97] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
              View Documentation
            </button>
          </div>
        </div>

        <!-- Canvas preview -->
        <div class="w-full max-w-5xl z-10 relative">
          <div class="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm overflow-hidden flex flex-col h-[500px]">
            <div class="h-12 border-b border-surface-variant bg-surface flex items-center justify-between px-4">
              <div class="flex items-center gap-2">
                <div class="w-3 h-3 rounded-full bg-outline-variant"></div>
                <div class="w-3 h-3 rounded-full bg-outline-variant"></div>
                <div class="w-3 h-3 rounded-full bg-outline-variant"></div>
                <span class="ml-4 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Checkout_Flow_v2</span>
              </div>
              <div class="flex items-center gap-2">
                <button type="button" class="text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-full p-1 transition-colors"><span class="material-symbols-outlined text-[18px]">undo</span></button>
                <button type="button" class="text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-full p-1 transition-colors"><span class="material-symbols-outlined text-[18px]">redo</span></button>
                <div class="h-4 w-px bg-surface-variant mx-2"></div>
                <button type="button" class="bg-primary text-on-primary px-3 py-1 rounded-full font-label-sm text-label-sm hover:bg-secondary active:scale-[0.97] transition-all shadow-sm">Execute</button>
              </div>
            </div>

            <div class="flex-grow bg-surface relative overflow-hidden flex items-center justify-center p-8 grid-bg">
              <svg class="absolute inset-0 w-full h-full pointer-events-none" style="z-index: 1">
                <path d="M 280 250 C 350 250, 400 180, 480 180" fill="none" stroke="#e2e3e0" stroke-width="2"></path>
                <path d="M 280 250 C 350 250, 400 320, 480 320" fill="none" stroke="#e2e3e0" stroke-dasharray="4" stroke-width="2"></path>
                <path d="M 720 180 C 800 180, 820 250, 900 250" fill="none" stroke="#e2e3e0" stroke-width="2"></path>
              </svg>

              <div class="flex gap-16 md:gap-24 items-center w-full max-w-4xl relative z-10">
                <!-- Trigger -->
                <div class="bg-surface-container-lowest border border-surface-variant rounded-lg p-4 w-64 shadow-sm flex flex-col gap-3 relative transform hover:-translate-y-1 transition-transform">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2 text-primary font-label-md text-label-md">
                      <span class="material-symbols-outlined bg-surface-base p-1 rounded">bolt</span>
                      Webhook
                    </div>
                    <span class="material-symbols-outlined text-outline-variant text-[16px]">more_horiz</span>
                  </div>
                  <div class="text-body-sm text-on-surface-variant font-mono bg-surface p-2 rounded border border-surface-variant truncate">
                    POST /api/v1/checkout
                  </div>
                  <div class="absolute -right-3 top-1/2 -translate-y-1/2 w-4 h-4 bg-surface-container-lowest border-2 border-primary rounded-full"></div>
                </div>

                <!-- Processing column -->
                <div class="flex flex-col gap-12 relative z-10">
                  <div class="bg-surface-container-lowest border border-primary rounded-lg p-4 w-64 shadow-sm flex flex-col gap-3 relative ring-2 ring-secondary-container">
                    <div class="absolute -left-3 top-1/2 -translate-y-1/2 w-4 h-4 bg-surface-container-lowest border-2 border-primary rounded-full"></div>
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2 text-on-surface font-label-md text-label-md">
                        <span class="material-symbols-outlined bg-surface-container p-1 rounded">transform</span>
                        Data Transform
                      </div>
                    </div>
                    <div class="flex gap-2 mb-1">
                      <span class="px-2 py-0.5 bg-surface-container text-on-surface-variant rounded text-[10px] font-mono">MAP</span>
                      <span class="px-2 py-0.5 bg-secondary-container text-on-secondary-container rounded text-[10px] font-mono">JS</span>
                    </div>
                    <div class="text-body-sm text-on-surface-variant font-mono bg-surface p-2 rounded border border-surface-variant text-xs">
                      return {<br />&nbsp;&nbsp;userId: $input.id<br />}
                    </div>
                    <div class="absolute -right-3 top-1/2 -translate-y-1/2 w-4 h-4 bg-surface-container-lowest border-2 border-primary rounded-full"></div>
                  </div>

                  <div class="bg-surface-container-lowest border border-surface-variant rounded-lg p-4 w-64 shadow-sm flex flex-col gap-3 relative opacity-60">
                    <div class="absolute -left-3 top-1/2 -translate-y-1/2 w-4 h-4 bg-surface-container-lowest border-2 border-outline-variant rounded-full"></div>
                    <div class="flex items-center gap-2 text-on-surface-variant font-label-md text-label-md">
                      <span class="material-symbols-outlined bg-surface-container p-1 rounded">call_split</span>
                      Condition
                    </div>
                  </div>
                </div>

                <!-- Destination -->
                <div class="bg-surface-container-lowest border border-surface-variant rounded-lg p-4 w-64 shadow-sm flex flex-col gap-3 relative z-10">
                  <div class="absolute -left-3 top-1/2 -translate-y-1/2 w-4 h-4 bg-surface-container-lowest border-2 border-outline-variant rounded-full"></div>
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2 text-on-surface font-label-md text-label-md">
                      <span class="material-symbols-outlined bg-surface-container p-1 rounded">database</span>
                      PostgreSQL
                    </div>
                  </div>
                  <div class="text-body-sm text-on-surface-variant font-mono bg-surface p-2 rounded border border-surface-variant">
                    INSERT INTO users...
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Feature grid -->
      <section class="w-full px-margin-page py-16 flex flex-col gap-8 max-w-7xl mx-auto">
        <div class="text-center mb-8">
          <h2 class="font-headline-md text-headline-md text-on-surface">Engineered for Technical Workflows</h2>
          <p class="font-body-md text-body-md text-on-surface-variant mt-2">Tools that respect your intelligence, built for complex systems.</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[300px]">
          <div class="md:col-span-2 bg-surface-container-lowest border border-surface-variant rounded-xl p-8 flex flex-col relative overflow-hidden group">
            <div class="absolute inset-0 bg-gradient-to-br from-surface to-surface-container-lowest pointer-events-none"></div>
            <div class="relative z-10 max-w-sm">
              <span class="material-symbols-outlined text-primary text-3xl mb-4">bug_report</span>
              <h3 class="font-headline-md text-headline-md text-on-surface mb-2">Safe Dry-Runs</h3>
              <p class="font-body-md text-body-md text-on-surface-variant">Test complex logic paths without affecting production data. Our sandbox environment simulates full execution environments.</p>
            </div>
            <div class="absolute right-0 bottom-0 p-8 opacity-80 group-hover:opacity-100 transition-opacity">
              <div class="bg-inverse-surface rounded-lg p-4 shadow-xl border border-outline w-64 transform rotate-2 translate-y-4 translate-x-4">
                <div class="flex items-center gap-2 mb-2 border-b border-outline pb-2">
                  <span class="material-symbols-outlined text-secondary-fixed-dim text-sm">check_circle</span>
                  <span class="font-mono text-[10px] text-inverse-on-surface">Dry Run Successful</span>
                </div>
                <div class="font-mono text-[10px] text-outline-variant leading-tight">
                  &gt; Executing step 1... OK<br />
                  &gt; Data mapping... OK<br />
                  &gt; Mocking API response...
                </div>
              </div>
            </div>
          </div>

          <div class="bg-surface-container-lowest border border-surface-variant rounded-xl p-8 flex flex-col relative overflow-hidden">
            <span class="material-symbols-outlined text-primary text-3xl mb-4">code_blocks</span>
            <h3 class="font-headline-md text-headline-md text-on-surface mb-2">Native Expressions</h3>
            <p class="font-body-md text-body-md text-on-surface-variant mb-6">Write raw JavaScript or JSONata directly in the node configuration. No more fighting with clunky UI builders.</p>
            <div class="mt-auto bg-surface border border-surface-variant rounded p-3 font-mono text-[11px] text-on-surface-variant">
              <span class="text-code-accent">const</span> total = items.reduce(<br />
              &nbsp;&nbsp;(sum, item) =&gt; sum + item.price,<br />
              &nbsp;&nbsp;0<br />
              );
            </div>
          </div>

          <div class="md:col-span-3 bg-surface-elevated border border-border-muted rounded-xl p-8 flex flex-col md:flex-row items-center gap-8 overflow-hidden relative">
            <div class="flex-1 relative z-10">
              <div class="inline-flex items-center gap-2 px-3 py-1 bg-surface-container-lowest border border-border-muted text-primary rounded-full font-label-sm text-label-sm uppercase tracking-wider mb-4">
                <span class="material-symbols-outlined text-[14px]">smart_toy</span>
                AI Assistant
              </div>
              <h3 class="font-headline-md text-headline-md text-on-surface mb-2">Your Node Pair Programmer</h3>
              <p class="font-body-md text-body-md text-on-surface-variant max-w-xl">
                Describe your transformation logic in plain English. The built-in AI assistant generates perfect mapping expressions instantly, maintaining high-fidelity syntax.
              </p>
            </div>
            <div class="flex-1 w-full bg-surface-container-lowest rounded-lg border border-border-muted p-4 shadow-sm relative z-10">
              <div class="flex flex-col gap-4">
                <div class="flex items-start gap-3">
                  <div class="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center shrink-0">
                    <span class="material-symbols-outlined text-on-surface-variant text-sm">person</span>
                  </div>
                  <div class="bg-surface rounded-lg p-3 text-body-sm text-on-surface-variant">
                    "Extract the email domains from this array of user objects and return them as a unique list."
                  </div>
                </div>
                <div class="flex items-start gap-3">
                  <div class="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0">
                    <span class="material-symbols-outlined text-sm">smart_toy</span>
                  </div>
                  <div class="bg-surface-container-lowest border border-primary rounded-lg p-3 text-body-sm font-mono text-on-surface-variant w-full shadow-sm ring-1 ring-secondary-container">
                    return [...new Set($input.users.map(u =&gt; u.email.split('@')[1]))];
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>

    <footer class="bg-surface-container-lowest border-t border-surface-variant flex justify-between items-center px-margin-page py-4 w-full mt-auto">
      <div class="font-body-sm text-body-sm font-bold text-on-surface">© {{ year }} Runnel Automation</div>
      <div class="flex gap-6 font-label-sm text-label-sm">
        <a class="text-on-surface-variant hover:text-primary transition-colors" href="#">Documentation</a>
        <a class="text-on-surface-variant hover:text-primary transition-colors" href="#">System Status</a>
        <a class="text-on-surface-variant hover:text-primary transition-colors" href="#">Changelog</a>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.grid-bg {
  background-size: 16px 16px;
  background-image:
    linear-gradient(to right, #e2e3e0 1px, transparent 1px),
    linear-gradient(to bottom, #e2e3e0 1px, transparent 1px);
  opacity: 0.4;
}
</style>
