<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { RunnelButton, RunnelInput } from '@runnel/design-system';
import { useAuthStore } from '../stores/auth.store.js';

const email = ref('');
const password = ref('');
const error = ref<string | null>(null);
const submitting = ref(false);

const auth = useAuthStore();
const router = useRouter();

async function onSubmit(): Promise<void> {
  error.value = null;
  submitting.value = true;
  try {
    await auth.login(email.value, password.value);
    await router.push({ name: 'workflows' });
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="auth-screen">
    <form class="auth-form" @submit.prevent="onSubmit">
      <h1>Log in</h1>
      <label>
        Email
        <RunnelInput v-model="email" type="email" placeholder="you@example.com" />
      </label>
      <label>
        Password
        <RunnelInput v-model="password" type="password" />
      </label>
      <p v-if="error" class="auth-error">{{ error }}</p>
      <RunnelButton :disabled="submitting">{{ submitting ? 'Logging in…' : 'Log in' }}</RunnelButton>
    </form>
  </div>
</template>
