import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UnoButton } from '../UnoButton';

describe('UnoButton Component', () => {
  it('renders disabled button when canCallUno is false', () => {
    const onCallUno = vi.fn();
    render(<UnoButton canCallUno={false} onCallUno={onCallUno} />);

    const button = screen.getByRole('button', { name: /shout uno/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onCallUno).not.toHaveBeenCalled();
  });

  it('renders active button and fires onCallUno when canCallUno is true', () => {
    const onCallUno = vi.fn();
    render(<UnoButton canCallUno={true} onCallUno={onCallUno} />);

    const button = screen.getByRole('button', { name: /shout uno/i });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(onCallUno).toHaveBeenCalledTimes(1);
  });

  it('displays UNO CALLED badge when player has already declared UNO', () => {
    render(
      <UnoButton
        canCallUno={false}
        hasDeclaredUno={true}
        onCallUno={vi.fn()}
      />
    );

    expect(screen.getByText('UNO CALLED!')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /shout uno/i })).not.toBeInTheDocument();
  });

  it('displays VULNERABLE badge when player has 1 card without declaring UNO', () => {
    render(
      <UnoButton
        canCallUno={false}
        hasDeclaredUno={false}
        isVulnerable={true}
        onCallUno={vi.fn()}
      />
    );

    expect(screen.getByText('VULNERABLE!')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /shout uno/i })).not.toBeInTheDocument();
  });

  it('displays UNO ARMED button when isArmed is true and toggles on click', () => {
    const onCallUno = vi.fn();
    render(
      <UnoButton
        canCallUno={true}
        isArmed={true}
        onCallUno={onCallUno}
      />
    );

    const button = screen.getByRole('button', { name: /uno armed/i });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(onCallUno).toHaveBeenCalledTimes(1);
  });
});
