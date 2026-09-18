<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { notificationsApi } from '../../api/notifications.js';
import { useAuthStore } from '../../stores/auth.store.js';
import type { INotificationRecord } from '../../api/types.js';

/**
 * The bell / settings / account cluster shared by the library and the editor — both top bars
 * carried an identical copy of the avatar menu before, and the bell needs polling state that
 * shouldn't exist twice.
 */

const POLL_INTERVAL_MS = 30_000;

const router = useRouter();
const authStore = useAuthStore();

const notifications = ref<INotificationRecord[]>([]);
const unreadCount = ref(0);
const bellOpen = ref(false);
const bellRoot = ref<HTMLElement | null>(null);
const avatarMenuOpen = ref(false);
const avatarMenuRoot = ref<HTMLElement | null>(null);
const userInitial = computed(() => (authStore.user?.email ?? '?').charAt(0).toUpperCase());

let pollTimer: ReturnType<typeof setInterval> | undefined;

async function refreshNotifications(): Promise<void> {
  try {
    const feed = await notificationsApi.feed();
    notifications.value = feed.items;
    unreadCount.value = feed.unreadCount;
  } catch {
    // A failing poll must never break the page the bell happens to sit on.
  }
}

/** Opening the bell is what marks its contents read — the badge is "things you haven't looked at". */
async function toggleBell(): Promise<void> {
  bellOpen.value = !bellOpen.value;
  avatarMenuOpen.value = false;
  if (!bellOpen.value || unreadCount.value === 0) return;
  await notificationsApi.markAllRead();
  unreadCount.value = 0;
  notifications.value = notifications.value.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() }));
}

async function clearAll(): Promise<void> {
  await notificationsApi.clear();
  notifications.value = [];
  unreadCount.value = 0;
}

function openNotification(notification: INotificationRecord): void {
  if (!notification.workflowId) return;
  bellOpen.value = false;
  void router.push({ name: 'workflow-edit', params: { id: notification.workflowId } });
}

function iconFor(type: INotificationRecord['type']): string {
  if (type === 'execution_failed') return 'error';
  return type === 'workflow_activated' ? 'play_circle' : 'pause_circle';
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minute = 60_000;
  const hour = 3_600_000;
  const day = 86_400_000;
  if (diffMs < minute) return 'just now';
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
  if (diffMs < day * 30) return `${Math.floor(diffMs / day)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function onDocumentClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  if (bellOpen.value && !bellRoot.value?.contains(target)) bellOpen.value = false;
  if (avatarMenuOpen.value && !avatarMenuRoot.value?.contains(target)) avatarMenuOpen.value = false;
}

async function logout(): Promise<void> {
  avatarMenuOpen.value = false;
  await authStore.logout();
  await router.push({ name: 'login' });
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick);
  void refreshNotifications();
  pollTimer = setInterval(() => void refreshNotifications(), POLL_INTERVAL_MS);
});

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick);
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<template>
  <div ref="bellRoot" class="topbar-bell">
    <button
      type="button"
      class="icon-button icon-button--lg"
      :aria-expanded="bellOpen"
      :title="unreadCount > 0 ? `${unreadCount} unread notification(s)` : 'Notifications'"
      aria-label="Notifications"
      @click="toggleBell"
    >
      <span class="material-symbols-outlined text-[20px]">notifications</span>
      <span v-if="unreadCount > 0" class="topbar-bell__badge">{{ unreadCount > 9 ? '9+' : unreadCount }}</span>
    </button>

    <div v-if="bellOpen" class="topbar-bell__panel" role="menu">
      <header class="topbar-bell__panel-head">
        <span>Notifications</span>
        <button v-if="notifications.length" type="button" class="topbar-bell__clear" @click="clearAll">Clear all</button>
      </header>

      <p v-if="!notifications.length" class="topbar-bell__empty">Nothing yet. Failed runs and activation changes show up here.</p>

      <button
        v-for="notification in notifications"
        :key="notification.id"
        type="button"
        class="topbar-bell__item"
        :class="{ 'topbar-bell__item--unread': !notification.readAt, 'topbar-bell__item--error': notification.type === 'execution_failed' }"
        @click="openNotification(notification)"
      >
        <span class="material-symbols-outlined text-[18px]">{{ iconFor(notification.type) }}</span>
        <span class="topbar-bell__item-body">
          <span class="topbar-bell__item-title">{{ notification.workflowName }}</span>
          <span class="topbar-bell__item-detail">{{ notification.message }}</span>
        </span>
        <span class="topbar-bell__item-time">{{ formatRelativeTime(notification.createdAt) }}</span>
      </button>
    </div>
  </div>

  <RouterLink :to="{ name: 'settings' }" class="icon-button icon-button--lg" title="Settings" aria-label="Settings">
    <span class="material-symbols-outlined text-[20px]">settings</span>
  </RouterLink>

  <div ref="avatarMenuRoot" class="app-avatar-wrap">
    <button
      type="button"
      class="app-avatar"
      :aria-expanded="avatarMenuOpen"
      aria-label="Account menu"
      :title="authStore.user?.email"
      @click="avatarMenuOpen = !avatarMenuOpen"
    >
      {{ userInitial }}
    </button>
    <div v-if="avatarMenuOpen" class="app-avatar-menu" role="menu">
      <div v-if="authStore.user" class="app-avatar-email">{{ authStore.user.email }}</div>
      <RouterLink :to="{ name: 'settings' }" class="app-avatar-menu-item" role="menuitem" @click="avatarMenuOpen = false">
        <span class="material-symbols-outlined text-[16px]">settings</span>
        Settings
      </RouterLink>
      <button type="button" class="app-avatar-menu-item" role="menuitem" @click="logout">
        <span class="material-symbols-outlined text-[16px]">logout</span>
        Log out
      </button>
    </div>
  </div>
</template>
