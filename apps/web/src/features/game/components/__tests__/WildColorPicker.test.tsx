import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WildColorPicker } from '../WildColorPicker';

describe('WildColorPicker Component', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(
      <WildColorPicker isOpen={false} onSelectColor={vi.fn()} onClose={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders 4 UNO colors when open', () => {
    render(
      <WildColorPicker isOpen={true} onSelectColor={vi.fn()} onClose={vi.fn()} />
    );

    expect(screen.getByText('Red')).toBeInTheDocument();
    expect(screen.getByText('Yellow')).toBeInTheDocument();
    expect(screen.getByText('Green')).toBeInTheDocument();
    expect(screen.getByText('Blue')).toBeInTheDocument();
  });

  it('calls onSelectColor with selected color', () => {
    const onSelectColor = vi.fn();
    render(
      <WildColorPicker isOpen={true} onSelectColor={onSelectColor} onClose={vi.fn()} />
    );

    fireEvent.click(screen.getByText('Red'));
    expect(onSelectColor).toHaveBeenCalledWith('red');

    fireEvent.click(screen.getByText('Green'));
    expect(onSelectColor).toHaveBeenCalledWith('green');
  });
});
