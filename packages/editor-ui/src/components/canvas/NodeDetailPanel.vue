<script setup lang="ts">
import { computed } from 'vue';
import { N8nInput, N8nModal } from '@n8n-clone/design-system';
import PropertyField from './PropertyField.vue';
import CredentialPicker from './CredentialPicker.vue';
import { useNodeTypesStore } from '../../stores/nodeTypes.store.js';
import { useWorkflowStore } from '../../stores/workflow.store.js';
import { isPropertyVisible } from '../../utils/displayOptions.js';
import type { IDataObject, IDataObjectValue, INodeExecutionData } from '@n8n-clone/workflow';

const props = defineProps<{ nodeId: string | null }>();
const emit = defineEmits<{ close: [] }>();

const workflowStore = useWorkflowStore();
const nodeTypesStore = useNodeTypesStore();

const node = computed(() => workflowStore.nodes.find((n) => n.id === props.nodeId) ?? null);
const description = computed(() => (node.value ? nodeTypesStore.byName(node.value.type) : undefined));

/**
 * A freshly-added node's `parameters` is `{}` — nothing has materialized each property's
 * `default` into it yet (only PropertyField applies defaults, and only for display). But
 * displayOptions.show/hide conditions read sibling values directly, so without merging in
 * declared defaults here, a property whose visibility depends on another property's default
 * (e.g. Set's "Fields to Set" needing mode === 'manual', the default) would incorrectly stay
 * hidden until the user explicitly touches that other field.
 */
const values = computed<IDataObject>(() => {
  const defaults: IDataObject = {};
  for (const property of description.value?.properties ?? []) {
    defaults[property.name] = property.default as IDataObjectValue;
  }
  return { ...defaults, ...node.value?.parameters };
});

const visibleProperties = computed(() =>
  (description.value?.properties ?? []).filter((property) => property.type !== 'hidden' && isPropertyVisible(property, values.value)),
);

/** Output data is keyed by node *name* in IRunExecutionData — a rename after the last run means there's simply nothing recorded under the new name yet, same as any other node. */
const lastTask = computed(() => {
  if (!node.value) return undefined;
  const runs = workflowStore.lastResult?.data.resultData.runData[node.value.name];
  return runs?.at(-1);
});

const outputItems = computed<INodeExecutionData[]>(() => lastTask.value?.data?.main[0] ?? []);

function updateValue(name: string, value: IDataObjectValue): void {
  if (!node.value) return;
  workflowStore.updateNodeParameters(node.value.id, { ...node.value.parameters, [name]: value });
}

function onNameChange(name: string): void {
  if (node.value) workflowStore.renameNode(node.value.id, name);
}

function close(): void {
  emit('close');
}
</script>

<template>
  <N8nModal :model-value="node !== null" :title="description?.displayName ?? node?.type ?? ''" @update:model-value="close">
    <div v-if="node" class="ndv">
      <section class="ndv__panel">
        <h3>Input</h3>

        <label class="property-field">
          Name
          <N8nInput :model-value="node.name" @update:model-value="onNameChange" />
        </label>

        <CredentialPicker
          v-for="credential in description?.credentials ?? []"
          :key="credential.name"
          :credential-type-name="credential.name"
          :node-id="node.id"
        />

        <PropertyField
          v-for="property in visibleProperties"
          :key="property.name"
          :property="property"
          :model-value="values[property.name]"
          @update:model-value="(v) => updateValue(property.name, v)"
        />

        <p v-if="visibleProperties.length === 0 && !description?.credentials?.length" style="color: #888">
          This node has no configurable parameters.
        </p>
      </section>

      <section class="ndv__panel">
        <h3>Output</h3>

        <p v-if="!lastTask" class="ndv__output-empty">Run the workflow to see this node's output here.</p>
        <template v-else>
          <span :class="['ndv__output-status', `ndv__output-status--${lastTask.executionStatus}`]">
            {{ lastTask.executionStatus }}
          </span>

          <p v-if="lastTask.error" class="auth-error">{{ lastTask.error.message }}</p>

          <p v-if="lastTask.executionStatus === 'success' && outputItems.length === 0" class="ndv__output-empty">
            No output items.
          </p>
          <div v-for="(item, index) in outputItems" :key="index" class="ndv__output-item">{{
            JSON.stringify(item.json, null, 2)
          }}</div>
        </template>
      </section>
    </div>
  </N8nModal>
</template>
