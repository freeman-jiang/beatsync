import React from 'react';
import QRCode from 'react-qr-code';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Button } from './ui/button';

interface QRCodeModalProps {
  roomId: string;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({ roomId }: QRCodeModalProps) => {
  const joinUrl = `https://www.beatsync.gg/room/${roomId}`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="text-xs">Show QR Code</Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4">
        <div className="flex flex-col items-center">
          <QRCode value={joinUrl} size={200} />
          <p className="mt-2 text-sm text-neutral-400">Scan this on another device to join the session</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}; 