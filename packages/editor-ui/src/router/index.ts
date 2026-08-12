import { createRouter, createWebHistory } from 'vue-router';
import { resolveNavigation } from './guard.js';
import { useAuthStore } from '../stores/auth.store.js';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/setup', name: 'setup', component: () => import('../views/SetupView.vue') },
    { path: '/login', name: 'login', component: () => import('../views/LoginView.vue') },
    { path: '/', name: 'workflows', component: () => import('../views/WorkflowListView.vue') },
    { path: '/workflow/new', name: 'workflow-new', component: () => import('../views/WorkflowEditorView.vue') },
    { path: '/workflow/:id', name: 'workflow-edit', component: () => import('../views/WorkflowEditorView.vue'), props: true },
  ],
});

router.beforeEach((to) => resolveNavigation(to, useAuthStore()));

export default router;
