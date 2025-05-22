import React, { useState } from 'react';
import QRCode from 'react-qr-code';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

interface QRCodeModalProps {
  roomId: string;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({ roomId }: QRCodeModalProps) => {
  const joinUrl = `${window.location.origin}/room/${roomId}`;
  const [feedbackMessage, setFeedbackMessage] = useState('');

  const clearFeedback = () => {
    setTimeout(() => {
      setFeedbackMessage('');
    }, 3000);
  };

  const handleShareOrCopy = async () => {
    const shareData = {
      title: 'Join my session',
      text: `Join my session using this link: ${joinUrl}`,
      url: joinUrl,
    };

    if (navigator.share) {
      try {
        setFeedbackMessage('Sharing...');
        await navigator.share(shareData);
        setFeedbackMessage('Link shared!');
        clearFeedback();
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          setFeedbackMessage('Share canceled');
        } else {
          // Fallback to copy if navigator.share fails for other reasons
          try {
            await navigator.clipboard.writeText(joinUrl);
            setFeedbackMessage('Link copied!');
          } catch (copyError) {
            setFeedbackMessage('Failed to copy link');
          }
        }
        clearFeedback();
      }
    } else {
      // Fallback to copy if navigator.share is not available
      try {
        await navigator.clipboard.writeText(joinUrl);
        setFeedbackMessage('Link copied!');
      } catch (copyError) {
        setFeedbackMessage('Failed to copy link');
      }
      clearFeedback();
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <span className="text-neutral-400 hover:text-white transition-colors cursor-pointer">QR Code</span>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4">
        <div className="flex flex-col items-center">
          <div onClick={handleShareOrCopy} className="cursor-pointer">
            <QRCode value={joinUrl} size={200} />
          </div>
          <p onClick={handleShareOrCopy} className="mt-2 text-sm text-neutral-400 cursor-pointer">
            Click here to share link
          </p>
          {feedbackMessage && <p className="mt-2 text-sm text-green-500">{feedbackMessage}</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}; 