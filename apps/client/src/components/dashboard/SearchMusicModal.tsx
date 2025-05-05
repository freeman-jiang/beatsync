"use client";

import { useState } from "react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import type {
  Pagination,
  DABTrack as Track,
} from "@beatsync/shared/types/schemas/dab";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { downloadTrack, searchTracks } from "@/lib/api";

import {
  Download,
  Loader2,
  Search,
  Clock,
  ArrowRight,
  ArrowLeft,
  ArrowLeftToLine,
  ArrowRightToLine,
} from "lucide-react";
import { useRoomStore } from "@/store/room";

type SearchMusicModalProps = {
  opened: boolean;
  setOpened: (opened: boolean) => void;
};

export const SearchMusicModal = ({
  opened,
  setOpened,
}: SearchMusicModalProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const [trackResult, setTrackResults] = useState<Track[] | null>(null);
  const [pageResult, setPageResults] = useState<Pagination | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = (offset: number = page * 10) => {
    setIsLoading(true);
    searchTracks(searchQuery, offset)
      .then(({ tracks, pagination }) => {
        setTrackResults(tracks);
        setPageResults(pagination);
      })
      .finally(() => setIsLoading(false));
  };

  const onOpenChange = (opened: boolean) => {
    if (!opened) {
      setSearchQuery("");
      setTrackResults(null);
      setPageResults(null);
    }
    setOpened(opened);
  };

  const setPageSafe = (target: number) => {
    let safePage = 0;
    if (pageResult != null) {
      // Offset is indexed at 0, and our pages are just offset * 10
      const maxPages = Math.floor(pageResult.total / 10 - 1);
      safePage = Math.max(0, Math.min(maxPages, target));
    }
    setPage(safePage);
    // Need to use the just computed offset, since next's state change doesn't propagate that fast
    handleSearch(safePage * 10);
  };

  return (
    <Dialog open={opened} defaultOpen={false} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2/3">
        <DialogHeader>
          <DialogTitle>Search tracks</DialogTitle>
          <DialogDescription>
            Search for your tracks here, download and close when you are done.
          </DialogDescription>
        </DialogHeader>
        <div className="gap-4 py-4 flex flex-row space-x-1">
          <div className="relative w-full">
            <Input
              id="searchQuery"
              placeholder="Song title, artist or album"
              className="col-span-3 tracking-wide brightness-95"
              style={{ fontSize: "15px" }}
              onChange={(e) => {
                setSearchQuery(e.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && searchQuery.length > 0) {
                  // Start at first page for a new search query
                  setPage(0);
                  handleSearch();
                }
              }}
            />
            {isLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            )}
          </div>
          <Button
            className="cursor-pointer"
            disabled={searchQuery.length === 0 || isLoading}
            onClick={() => {
              // Start at first page for a new search query
              setPage(0);
              handleSearch();
            }}
          >
            <Search />
          </Button>
        </div>
        {trackResult && <ResultsTable results={trackResult} />}
        <div className="flex justify-between">
          <div></div>
          {pageResult && (
            <div className="pl-2 flex-initial">
              <div className="flex *:text-neutral-200 gap-3">
                <Button
                  variant={"outline"}
                  className="bg-muted/50 cursor-pointer"
                  onClick={() => setPageSafe(0)}
                  disabled={page < 1}
                >
                  <ArrowLeftToLine />
                </Button>
                <Button
                  variant={"outline"}
                  className="bg-muted/50 cursor-pointer"
                  onClick={() => setPageSafe(page - 1)}
                  disabled={page < 1}
                >
                  <ArrowLeft />
                </Button>

                <p className="text-[16px] font-medium tracking-wide bg-inherit pt-1.5 font-mono">{`${
                  page + 1
                }/${Math.floor(pageResult.total / 10 - 1) + 1}`}</p>

                <Button
                  variant={"outline"}
                  className="bg-muted/50 cursor-pointer"
                  onClick={() => setPageSafe(page + 1)}
                  disabled={page >= Math.floor(pageResult.total / 10 - 1)}
                >
                  <ArrowRight />
                </Button>
                <Button
                  variant={"outline"}
                  className="bg-muted/50 cursor-pointer"
                  onClick={() =>
                    setPageSafe(Math.floor(pageResult.total / 10 - 1))
                  }
                  disabled={page >= Math.floor(pageResult.total / 10 - 1)}
                >
                  <ArrowRightToLine />
                </Button>
              </div>
            </div>
          )}
          <Button
            className="cursor-pointer w-16 flex-none"
            onClick={() => onOpenChange(false)}
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

type ResultsTableProps = {
  results: Track[];
};

const ResultsTable = ({ results }: ResultsTableProps) => {
  const roomId = useRoomStore((state) => state.roomId);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async (trackId: number, name: string) => {
    setIsDownloading(true);
    downloadTrack({
      name,
      roomId,
      trackId,
    }).finally(() => setIsDownloading(false));
  };

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-inherit">
          <TableHead className="w-10 text-right"></TableHead>
          <TableHead className="max-w-56">Track</TableHead>
          <TableHead className="max-w-56">Album</TableHead>
          <TableHead className="relative">
            <div className="absolute top-3 right-5">
              <Clock className="size-5" />
            </div>
          </TableHead>
          <TableHead className="w-8">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {results.map((track) => (
          <TableRow key={track.id}>
            <TableCell className="p-0 pl-3 pr-3">
              <img
                className="rounded-md max-w-10"
                src={track.images.thumbnail}
              ></img>
            </TableCell>
            <TableCell className="pr-0">
              <div className="flex flex-col">
                <p
                  className="text-[15px] font-semibold text-neutral-100 truncate max-w-56"
                  title={"Title: " + track.title}
                >
                  {track.title}
                </p>
                <p
                  className="text-sm truncate max-w-56"
                  title={"Artist: " + track.artist}
                >
                  {track.artist}
                </p>
              </div>
            </TableCell>
            <TableCell className="px-0">
              <p
                className="text-[15px] truncate max-w-56"
                title={
                  "Album: " +
                  `${track.version ? track.version + " - " : ""}${track.albumTitle}`
                }
              >{`${track.version ? track.version + " - " : ""}${track.albumTitle}`}</p>
            </TableCell>
            <TableCell>
              <p className="font-mono">
                {(() => {
                  let seconds = String(track.duration % 60);
                  seconds = seconds + "0".repeat(2 - seconds.length);
                  return (track.duration / 60).toFixed(0) + ":" + seconds;
                })()}
              </p>
            </TableCell>
            <TableCell className="text-right">
              <Button
                className="cursor-pointer"
                variant={"outline"}
                disabled={isDownloading}
                onClick={() => handleDownload(track.id, track.title)}
              >
                <Download />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
