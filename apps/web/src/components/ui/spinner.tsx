import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'default' | 'lg';
}

const sizeClasses = {
  sm: 'h-4 w-4',
  default: 'h-6 w-6',
  lg: 'h-8 w-8',
};

export const Spinner = React.forwardRef<HTMLDivElement, SpinnerProps>(
  ({ className, size = 'default', ...props }, ref) => {
    return (
      <div
        ref={ref}
        role="status"
        aria-label="Loading"
        className={cn('inline-flex items-center justify-center', className)}
        {...props}
      >
        <Loader2 className={cn('animate-spin text-amber-400', sizeClasses[size])} />
        <span className="sr-only">Loading...</span>
      </div>
    );
  }
);
Spinner.displayName = 'Spinner';
