import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  Avatar,
  Button,
  CommandPalette,
  DataTable,
  Dialog,
  DialogContent,
  Field,
  initials,
  Input,
  ProgressRing,
  Segmented,
} from './index';
import { CountUp, MotionProvider } from './motion';

describe('Button', () => {
  it('is disabled and busy while loading', () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveProperty('disabled', true);
    expect(button.getAttribute('aria-busy')).toBe('true');
  });

  it('renders a link with button styles via asChild', () => {
    render(
      <Button asChild>
        <a href="/learn">Start</a>
      </Button>,
    );
    expect(screen.getByRole('link', { name: 'Start' }).className).toContain('bg-accent');
  });
});

describe('Field', () => {
  it('wires the label, help and error to the control', () => {
    render(
      <Field label="Email" description="We never share it" error="Enter a valid email" required>
        <Input type="email" />
      </Field>,
    );
    const input = screen.getByLabelText(/Email/);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const described = input.getAttribute('aria-describedby')!.split(' ');
    expect(described.map((id) => document.getElementById(id)?.textContent)).toEqual([
      'We never share it',
      'Enter a valid email',
    ]);
  });
});

describe('DataTable', () => {
  it('sorts by a column and reports it with aria-sort', async () => {
    const rows = [
      { id: 'a', name: 'Zara', xp: 10 },
      { id: 'b', name: 'Asha', xp: 30 },
    ];
    render(
      <DataTable
        caption="Users"
        rows={rows}
        rowKey={(r) => r.id}
        columns={[
          { key: 'name', header: 'Name', cell: (r) => r.name, sortValue: (r) => r.name },
          { key: 'xp', header: 'XP', cell: (r) => r.xp },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Name/ }));
    const header = screen.getByRole('columnheader', { name: /Name/ });
    expect(header.getAttribute('aria-sort')).toBe('ascending');
    expect(
      screen
        .getAllByRole('row')
        .slice(1)
        .map((r) => r.textContent),
    ).toEqual(['Asha30', 'Zara10']);
    await userEvent.click(screen.getByRole('button', { name: /Name/ }));
    expect(header.getAttribute('aria-sort')).toBe('descending');
  });
});

describe('Dialog', () => {
  it('opens as a labelled modal and closes with Escape', async () => {
    function Demo() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Button onClick={() => setOpen(true)}>Open</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent title="Delete draft?" description="This cannot be undone.">
              body
            </DialogContent>
          </Dialog>
        </>
      );
    }
    render(<Demo />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('dialog', { name: 'Delete draft?' })).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('CommandPalette', () => {
  it('opens with Ctrl+K, filters, and runs the chosen item', async () => {
    const go = vi.fn();
    function Demo() {
      const [open, setOpen] = useState(false);
      return (
        <CommandPalette
          open={open}
          onOpenChange={setOpen}
          placeholder="Search"
          emptyText="Nothing found"
          items={[
            { id: 'learn', label: 'Learning path', group: 'Go to', onSelect: go },
            {
              id: 'settings',
              label: 'Settings',
              group: 'Go to',
              keywords: ['preferences'],
              onSelect: () => {},
            },
          ]}
        />
      );
    }
    render(<Demo />);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const input = await screen.findByPlaceholderText('Search');
    await userEvent.type(input, 'learn');
    expect(screen.queryByText('Settings')).toBeNull();
    await userEvent.keyboard('{Enter}');
    expect(go).toHaveBeenCalledOnce();
  });
});

describe('motion preferences', () => {
  it('shows final numbers at once and marks the page when animations are off', () => {
    render(
      <MotionProvider mode="off">
        <CountUp value={1234} />
      </MotionProvider>,
    );
    expect(screen.getByLabelText('1,234').textContent).toBe('1,234');
    expect(document.documentElement.dataset.motion).toBe('off');
  });

  it('counts up when animations are on', async () => {
    render(
      <MotionProvider mode="full">
        <CountUp value={50} />
      </MotionProvider>,
    );
    expect(screen.getByLabelText('50').textContent).toBe('0');
    await vi.waitFor(() => expect(screen.getByLabelText('50').textContent).toBe('50'), {
      timeout: 3000,
    });
  });
});

describe('small pieces', () => {
  it('derives initials and a stable avatar colour', () => {
    expect(initials('Asha Rao Kumar')).toBe('AK');
    expect(initials('ravi')).toBe('RA');
    const { rerender } = render(<Avatar name="Asha" />);
    const first = screen.getByRole('img', { name: 'Asha' }).className;
    rerender(<Avatar name="Asha" />);
    expect(screen.getByRole('img', { name: 'Asha' }).className).toBe(first);
  });

  it('progress ring exposes its value', () => {
    render(<ProgressRing value={42.4} label="Daily goal" />);
    expect(
      screen.getByRole('progressbar', { name: 'Daily goal' }).getAttribute('aria-valuenow'),
    ).toBe('42');
  });

  it('segmented control changes value', async () => {
    const onChange = vi.fn();
    render(
      <Segmented
        label="Theme"
        value="light"
        onChange={onChange}
        options={[
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
      />,
    );
    await act(() => userEvent.click(screen.getByRole('radio', { name: 'Dark' })));
    expect(onChange).toHaveBeenCalledWith('dark');
  });
});
