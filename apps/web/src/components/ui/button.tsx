import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#090c11] disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
  {
    variants: {
      variant: {
        default:
          'bg-red-600 text-white shadow hover:bg-red-500 focus-visible:ring-red-400',
        destructive:
          'bg-red-900/60 text-red-100 border border-red-700/50 hover:bg-red-800/80 focus-visible:ring-red-500',
        outline:
          'border border-white/15 bg-transparent text-slate-200 hover:bg-white/5 hover:text-white',
        secondary:
          'bg-slate-800 text-slate-100 border border-white/10 shadow-sm hover:bg-slate-700 hover:text-white',
        ghost:
          'text-slate-300 hover:bg-white/5 hover:text-white',
        link:
          'text-amber-400 underline-offset-4 hover:underline',
        brass:
          'bg-amber-600 text-white border border-amber-500/40 shadow hover:bg-amber-500 focus-visible:ring-amber-300',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 rounded-lg px-3 text-xs',
        lg: 'h-12 rounded-xl px-6 text-base font-medium',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
