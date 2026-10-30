// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { h } from 'vue';
import { mount } from '@vue/test-utils';
import { Add } from '@vicons/ionicons5';
import AppIcon from '../AppIcon.vue';

function mountIcon() {
  return mount(AppIcon, { slots: { default: () => h(Add) } });
}

describe('AppIcon.vue', () => {
  it('renders the supplied icon svg', () => {
    const wrapper = mountIcon();

    expect(wrapper.find('svg').exists()).toBe(true);
    expect(wrapper.find('svg').attributes('viewBox')).toBe('0 0 512 512');
  });

  it('keeps the icon aligned with surrounding text', () => {
    const wrapper = mountIcon();

    expect(wrapper.find('.xicon').classes()).toContain('align-middle');
  });
});
