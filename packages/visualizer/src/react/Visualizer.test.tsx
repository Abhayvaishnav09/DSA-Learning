// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Visualizer } from './Visualizer';

const SOURCE = `count = 0
for i from 1 to 2:
    count = count + 1
    say i`;

afterEach(cleanup);

describe('Visualizer', () => {
  it('steps forward and back with buttons and shows captions, boxes and screen', () => {
    render(<Visualizer source={SOURCE} locale="en" />);
    expect(screen.getByTestId('viz-step').textContent).toBe('Step 1 of 10');

    fireEvent.click(screen.getByRole('button', { name: 'Step forward' }));
    expect(screen.getByTestId('viz-caption').textContent).toBe(
      'Make a box called count and put 0 in it.',
    );
    expect(screen.getByRole('listitem', { current: 'step' }).textContent).toContain('count = 0');

    for (let i = 0; i < 4; i++)
      fireEvent.click(screen.getByRole('button', { name: 'Step forward' }));
    expect(screen.getByTestId('viz-output').textContent).toBe('1');
    expect(screen.getByTestId('viz-vars').textContent).toContain('count1');

    // Back past "say 1" (frame 4) to "count = count + 1" (frame 3): the screen empties again.
    fireEvent.click(screen.getByRole('button', { name: 'Step back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Step back' }));
    expect(screen.getByTestId('viz-output').textContent).toBe('Nothing shown yet');
  });

  it('supports the keyboard', () => {
    render(<Visualizer source={SOURCE} locale="en" />);
    const region = screen.getByTestId('visualizer');
    fireEvent.keyDown(region, { key: 'ArrowRight' });
    fireEvent.keyDown(region, { key: 'ArrowRight' });
    fireEvent.keyDown(region, { key: 'ArrowLeft' });
    expect(screen.getByTestId('viz-step').textContent).toBe('Step 2 of 10');
  });

  it('plays automatically and stops at the limit', () => {
    vi.useFakeTimers();
    const onFrameChange = vi.fn();
    render(
      <Visualizer source={SOURCE} locale="en" limit={3} autoPlay onFrameChange={onFrameChange} />,
    );
    // One tick per act() so each new timer is scheduled after React commits the previous step.
    for (let i = 0; i < 10; i++) act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByTestId('viz-step').textContent).toBe('Step 4 of 10');
    expect(screen.getByRole('button', { name: 'Step forward' })).toHaveProperty('disabled', true);
    expect(onFrameChange).toHaveBeenLastCalledWith(expect.objectContaining({ index: 3 }), false);
    vi.useRealTimers();
  });

  it('continues playing when the limit is lifted (after a prediction)', () => {
    vi.useFakeTimers();
    const { rerender } = render(<Visualizer source={SOURCE} locale="en" limit={3} autoPlay />);
    for (let i = 0; i < 5; i++) act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByTestId('viz-step').textContent).toBe('Step 4 of 10');
    rerender(<Visualizer source={SOURCE} locale="en" autoPlay />);
    for (let i = 0; i < 10; i++) act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByTestId('viz-step').textContent).toBe('Step 10 of 10');
    expect(screen.getByTestId('viz-output').textContent).toBe('12');
    vi.useRealTimers();
  });

  it('uses author captions when given and speaks Hinglish', () => {
    render(<Visualizer source={SOURCE} locale="hi-Latn" captions={{ 0: 'Custom start' }} />);
    expect(screen.getByTestId('viz-caption').textContent).toBe('Custom start');
    fireEvent.click(screen.getByRole('button', { name: 'Ek step aage' }));
    expect(screen.getByTestId('viz-caption').textContent).toBe(
      'count naam ka box banao aur usme 0 rakho.',
    );
  });
});

describe('Visualizer with lists and functions', () => {
  it('draws list cells with positions and the call stack', () => {
    render(
      <Visualizer
        source={'nums = [3, 8]\ndefine twice(x):\n    return x * 2\nsay twice(nums[1])'}
        locale="en"
      />,
    );
    // start → nums = [3, 8] → define → call
    for (let i = 0; i < 3; i++)
      fireEvent.click(screen.getByRole('button', { name: 'Step forward' }));
    expect(screen.getByLabelText('nums: [3, 8]')).toBeTruthy();
    expect(screen.getByTestId('viz-stack').textContent).toContain('twice( )');
    expect(screen.getByTestId('viz-caption').textContent).toBe(
      'Run twice with x = 8. It gets its own boxes.',
    );
  });
});
