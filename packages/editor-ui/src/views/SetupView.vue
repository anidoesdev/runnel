<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { N8nButton, N8nInput } from '@n8n-clone/design-system';
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
    await auth.setup(email.value, password.value);
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
      <h1>Set up your account</h1>
      <p>You're the first person here — create the owner account to get started.</p>
      <label>
        Email
        <N8nInput v-model="email" type="email" placeholder="you@example.com" />
      </label>
      <label>
        Password
        <N8nInput v-model="password" type="password" placeholder="At least 8 characters" />
      </label>
      <p v-if="error" class="auth-error">{{ error }}</p>
      <N8nButton :disabled="submitting">{{ submitting ? 'Creating…' : 'Create account' }}</N8nButton>
    </form>
  </div>
</template>
