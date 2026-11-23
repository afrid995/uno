import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { Button } from '../button';
import { Badge } from '../badge';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '../card';
import { Input } from '../input';
import { Label } from '../label';
import { Avatar, AvatarFallback, AvatarImage } from '../avatar';
import { Alert, AlertTitle, AlertDescription } from '../alert';
import { Spinner } from '../spinner';
import { Separator } from '../separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../tabs';
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from '../input-otp';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../dialog';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '../alert-dialog';
import { ScrollArea } from '../scroll-area';
import { Popover, PopoverTrigger, PopoverContent } from '../popover';

describe('UI Primitives', () => {
  describe('Button', () => {
    it('renders with default variant and responds to click', () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Play Card</Button>);
      const btn = screen.getByRole('button', { name: /play card/i });
      expect(btn).toBeInTheDocument();
      fireEvent.click(btn);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('renders brass and destructive variants with proper classes', () => {
      const { rerender } = render(<Button variant="brass">Brass Action</Button>);
      expect(screen.getByRole('button', { name: /brass action/i })).toHaveClass('bg-amber-600');

      rerender(<Button variant="destructive">Abandon Match</Button>);
      expect(screen.getByRole('button', { name: /abandon match/i })).toHaveClass('bg-red-900/60');
    });

    it('respects disabled attribute', () => {
      const handleClick = vi.fn();
      render(<Button disabled onClick={handleClick}>Disabled</Button>);
      const btn = screen.getByRole('button', { name: /disabled/i });
      expect(btn).toBeDisabled();
      fireEvent.click(btn);
      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe('Badge', () => {
    it('renders with variant classes', () => {
      const { rerender } = render(<Badge variant="brass">Host</Badge>);
      expect(screen.getByText('Host')).toHaveClass('text-amber-300');

      rerender(<Badge variant="emerald">Ready</Badge>);
      expect(screen.getByText('Ready')).toHaveClass('text-emerald-400');
    });
  });

  describe('Card', () => {
    it('composes card elements properly', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>Room Settings</CardTitle>
            <CardDescription>Configure rules</CardDescription>
          </CardHeader>
          <CardContent>Content Area</CardContent>
          <CardFooter>Footer Actions</CardFooter>
        </Card>
      );

      expect(screen.getByText('Room Settings')).toBeInTheDocument();
      expect(screen.getByText('Configure rules')).toBeInTheDocument();
      expect(screen.getByText('Content Area')).toBeInTheDocument();
      expect(screen.getByText('Footer Actions')).toBeInTheDocument();
    });
  });

  describe('Input and Label', () => {
    it('links label with input via htmlFor', () => {
      render(
        <div>
          <Label htmlFor="player-name">Player Name</Label>
          <Input id="player-name" placeholder="Enter alias" />
        </div>
      );

      const input = screen.getByLabelText(/player name/i);
      expect(input).toBeInTheDocument();
      fireEvent.change(input, { target: { value: 'AcePlayer' } });
      expect((input as HTMLInputElement).value).toBe('AcePlayer');
    });
  });

  describe('Avatar', () => {
    it('renders fallback when image is not loaded', () => {
      render(
        <Avatar>
          <AvatarImage src="/invalid.png" alt="Player 1" />
          <AvatarFallback>P1</AvatarFallback>
        </Avatar>
      );

      expect(screen.getByText('P1')).toBeInTheDocument();
    });
  });

  describe('Alert', () => {
    it('renders with role="alert" and variant styling', () => {
      render(
        <Alert variant="destructive">
          <AlertTitle>Connection Lost</AlertTitle>
          <AlertDescription>Attempting to rejoin match...</AlertDescription>
        </Alert>
      );

      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(screen.getByText('Connection Lost')).toBeInTheDocument();
      expect(screen.getByText('Attempting to rejoin match...')).toBeInTheDocument();
    });
  });

  describe('Spinner', () => {
    it('renders accessible loading spinner with role="status"', () => {
      render(<Spinner size="lg" />);
      const status = screen.getByRole('status');
      expect(status).toBeInTheDocument();
      expect(screen.getByText('Loading...')).toHaveClass('sr-only');
    });
  });

  describe('Separator', () => {
    it('renders decorative separator', () => {
      const { container } = render(<Separator orientation="horizontal" />);
      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe('Tabs', () => {
    it('renders tabs with active content', () => {
      render(
        <Tabs value="classic">
          <TabsList>
            <TabsTrigger value="classic">Classic</TabsTrigger>
            <TabsTrigger value="flip">Flip</TabsTrigger>
          </TabsList>
          <TabsContent value="classic">Classic Rules View</TabsContent>
          <TabsContent value="flip">Flip Rules View</TabsContent>
        </Tabs>
      );

      expect(screen.getByText('Classic Rules View')).toBeInTheDocument();
      expect(screen.queryByText('Flip Rules View')).not.toBeInTheDocument();
    });

    it('renders alternative tab content when value changes', () => {
      const { rerender } = render(
        <Tabs value="classic">
          <TabsList>
            <TabsTrigger value="classic">Classic</TabsTrigger>
            <TabsTrigger value="flip">Flip</TabsTrigger>
          </TabsList>
          <TabsContent value="classic">Classic Rules View</TabsContent>
          <TabsContent value="flip">Flip Rules View</TabsContent>
        </Tabs>
      );

      expect(screen.getByText('Classic Rules View')).toBeInTheDocument();

      rerender(
        <Tabs value="flip">
          <TabsList>
            <TabsTrigger value="classic">Classic</TabsTrigger>
            <TabsTrigger value="flip">Flip</TabsTrigger>
          </TabsList>
          <TabsContent value="classic">Classic Rules View</TabsContent>
          <TabsContent value="flip">Flip Rules View</TabsContent>
        </Tabs>
      );

      expect(screen.getByText('Flip Rules View')).toBeInTheDocument();
      expect(screen.queryByText('Classic Rules View')).not.toBeInTheDocument();
    });
  });

  describe('InputOTP', () => {
    it('renders slots defensively even in isolated tests', () => {
      render(
        <InputOTP maxLength={4}>
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSeparator />
            <InputOTPSlot index={2} />
            <InputOTPSlot index={3} />
          </InputOTPGroup>
        </InputOTP>
      );

      expect(screen.getByRole('separator')).toBeInTheDocument();
    });
  });

  describe('Dialog', () => {
    it('opens dialog content on trigger click', () => {
      render(
        <Dialog>
          <DialogTrigger asChild>
            <Button>Open Modal</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Game Lobby</DialogTitle>
              <DialogDescription>Waiting for host</DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      );

      expect(screen.queryByText('Game Lobby')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /open modal/i }));
      expect(screen.getByText('Game Lobby')).toBeInTheDocument();
      expect(screen.getByText('Waiting for host')).toBeInTheDocument();
    });
  });

  describe('AlertDialog', () => {
    it('renders confirmation alert dialog correctly', () => {
      const handleConfirm = vi.fn();
      render(
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">Leave Match</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>Leaving will forfeit the match.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>Confirm Forfeit</AlertDialogAction>
          </AlertDialogContent>
        </AlertDialog>
      );

      fireEvent.click(screen.getByRole('button', { name: /leave match/i }));
      expect(screen.getByText('Are you sure?')).toBeInTheDocument();
      expect(screen.getByText('Leaving will forfeit the match.')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /confirm forfeit/i }));
      expect(handleConfirm).toHaveBeenCalledTimes(1);
    });
  });

  describe('Popover', () => {
    it('opens popover content on trigger click', () => {
      render(
        <Popover>
          <PopoverTrigger asChild>
            <Button>View Details</Button>
          </PopoverTrigger>
          <PopoverContent>
            <p>Score summary: 250 pts</p>
          </PopoverContent>
        </Popover>
      );

      expect(screen.queryByText(/score summary/i)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /view details/i }));
      expect(screen.getByText(/score summary/i)).toBeInTheDocument();
    });
  });

  describe('ScrollArea', () => {
    it('renders children with scroll viewport', () => {
      render(
        <ScrollArea className="h-40">
          <div>Log item 1</div>
          <div>Log item 2</div>
        </ScrollArea>
      );

      expect(screen.getByText('Log item 1')).toBeInTheDocument();
      expect(screen.getByText('Log item 2')).toBeInTheDocument();
    });
  });
});
