<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RunnelButton, RunnelInput } from '@runnel/design-system';
import { settingsApi } from '../api/settings.js';
import { ApiError } from '../api/http.js';
import { useTheme } from '../composables/useTheme.js';
import { useAuthStore } from '../stores/auth.store.js';
import TopbarActions from '../components/app/TopbarActions.vue';
import type { ISystemInfo } from '../api/types.js';
import type { Theme } from '../composables/useTheme.js';

const authStore = useAuthStore();
const { theme, setTheme } = useTheme();

const system = ref<ISystemInfo | null>(null);
const tokenLimit = ref<number | null>(null);

const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const passwordError = ref('');
const passwordSaved = ref(false);
const savingPassword = ref(false);

const assistantSaved = ref(false);
const assistantError = ref('');
const savingAssistant = ref(false);

const THEMES: Array<{ value: Theme; label: string; icon: string }> = [
  { value: 'light', label: 'Light', icon: 'light_mode' },
  { value: 'dark', label: 'Dark', icon: 'dark_mode' },
];

onMounted(async () => {
  const [info, preferences] = await Promise.all([settingsApi.system(), settingsApi.preferences()]);
  system.value = info;
  tokenLimit.value = preferences.assistant?.tokenLimit ?? null;
});

async function saveAssistant(): Promise<void> {
  assistantError.value = '';
  assistantSaved.value = false;
  const limit = Number(tokenLimit.value);
  if (!Number.isInteger(limit) || limit < 1000 || limit > 1_000_000) {
    assistantError.value = 'Enter a whole number between 1,000 and 1,000,000.';
    return;
  }
  savingAssistant.value = true;
  try {
    await settingsApi.updatePreferences({ assistant: { tokenLimit: limit } });
    assistantSaved.value = true;
  } catch (error) {
    assistantError.value = error instanceof ApiError ? error.message : 'Could not save.';
  } finally {
    savingAssistant.value = false;
  }
}

async function changePassword(): Promise<void> {
  passwordError.value = '';
  passwordSaved.value = false;
  if (newPassword.value.length < 8) {
    passwordError.value = 'The new password must be at least 8 characters.';
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    passwordError.value = 'The two new passwords do not match.';
    return;
  }
  savingPassword.value = true;
  try {
    await settingsApi.changePassword(currentPassword.value, newPassword.value);
    passwordSaved.value = true;
    currentPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
  } catch (error) {
    passwordError.value = error instanceof ApiError ? error.message : 'Could not change the password.';
  } finally {
    savingPassword.value = false;
  }
}
</script>

<template>
  <div class="settings-view">
    <header class="settings-view__topbar">
      <RouterLink :to="{ name: 'workflows' }" class="settings-view__back" title="Back to workflows">
        <span class="material-symbols-outlined text-[20px]">arrow_back</span>
        Workflows
      </RouterLink>
      <div class="settings-view__topbar-actions">
        <TopbarActions />
      </div>
    </header>

    <main class="settings-view__main">
      <h1>Settings</h1>

      <section class="settings-card">
        <h2>Account</h2>
        <p class="settings-card__hint">Signed in as <strong>{{ authStore.user?.email }}</strong></p>

        <form class="settings-form" @submit.prevent="changePassword">
          <label>
            Current password
            <RunnelInput :model-value="currentPassword" type="password" autocomplete="current-password" @update:model-value="currentPassword = $event" />
          </label>
          <label>
            New password
            <RunnelInput :model-value="newPassword" type="password" autocomplete="new-password" @update:model-value="newPassword = $event" />
          </label>
          <label>
            Confirm new password
            <RunnelInput :model-value="confirmPassword" type="password" autocomplete="new-password" @update:model-value="confirmPassword = $event" />
          </label>
          <p v-if="passwordError" class="settings-card__error">{{ passwordError }}</p>
          <p v-if="passwordSaved" class="settings-card__ok">Password changed.</p>
          <div>
            <RunnelButton :disabled="savingPassword || !currentPassword || !newPassword">
              {{ savingPassword ? 'Saving…' : 'Change password' }}
            </RunnelButton>
          </div>
        </form>
      </section>

      <section class="settings-card">
        <h2>Appearance</h2>
        <p class="settings-card__hint">Stored in this browser only.</p>
        <div class="settings-theme">
          <button
            v-for="option in THEMES"
            :key="option.value"
            type="button"
            class="settings-theme__option"
            :class="{ 'settings-theme__option--active': theme === option.value }"
            :aria-pressed="theme === option.value"
            @click="setTheme(option.value)"
          >
            <span class="material-symbols-outlined text-[18px]">{{ option.icon }}</span>
            {{ option.label }}
          </button>
        </div>
      </section>

      <section class="settings-card">
        <h2>Assistant</h2>
        <p class="settings-card__hint">The token budget each new assistant session starts with.</p>
        <form class="settings-form settings-form--inline" @submit.prevent="saveAssistant">
          <label>
            Token budget
            <input v-model.number="tokenLimit" type="number" min="1000" max="1000000" step="1000" placeholder="200000" />
          </label>
          <RunnelButton :disabled="savingAssistant">{{ savingAssistant ? 'Saving…' : 'Save' }}</RunnelButton>
        </form>
        <p v-if="assistantError" class="settings-card__error">{{ assistantError }}</p>
        <p v-if="assistantSaved" class="settings-card__ok">Saved.</p>
      </section>

      <section class="settings-card">
        <h2>System</h2>
        <dl v-if="system" class="settings-system">
          <dt>Version</dt>
          <dd>{{ system.version }}</dd>
          <dt>Node.js</dt>
          <dd>{{ system.nodeVersion }}</dd>
          <dt>Database</dt>
          <dd>{{ system.database }}</dd>
          <dt>Custom nodes</dt>
          <dd>{{ system.customNodesDir ?? 'none configured' }}</dd>
          <dt>Assistant memory</dt>
          <dd>
            capture {{ system.memory.capture ? 'on' : 'off' }} · recall {{ system.memory.recall ? 'on' : 'off' }} ·
            budget {{ system.memory.tokenBudget }} tokens
          </dd>
        </dl>
        <p v-else class="settings-card__hint">Loading…</p>
      </section>
    </main>
  </div>
</template>
