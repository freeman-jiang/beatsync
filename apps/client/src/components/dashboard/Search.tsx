"use client";

import { Search as SearchIcon } from "lucide-react";
import * as React from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

interface SearchFormData {
  query: string;
}

export function Search() {
  const [open, setOpen] = React.useState(false);
  const { register, handleSubmit, watch, reset } = useForm<SearchFormData>({
    defaultValues: {
      query: "",
    },
  });

  const query = watch("query");

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const onSubmit = (data: SearchFormData) => {
    console.log("Search query:", data.query);
    // Handle search logic here
    setOpen(false);
    reset();
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      reset();
    }
  };

  return (
    <>
      <Button
        variant="outline"
        className="w-full justify-start text-muted-foreground bg-neutral-800/50 border-neutral-700 hover:bg-neutral-800"
        onClick={() => setOpen(true)}
      >
        <SearchIcon className="mr-2 h-4 w-4" />
        Search for music...
        <kbd className="ml-auto pointer-events-none inline-flex h-5 items-center gap-1 rounded border border-neutral-600 bg-neutral-700 px-1.5 font-mono text-[10px] font-medium text-neutral-300">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={handleOpenChange}>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CommandInput
            placeholder="Search for music..."
            {...register("query")}
          />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            {query && (
              <CommandGroup heading="Search Results">
                <CommandItem onSelect={() => handleSubmit(onSubmit)()}>
                  <SearchIcon className="mr-2 h-4 w-4" />
                  <span>Search for &quot;{query}&quot;</span>
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup heading="Recent Searches">
              <CommandItem>
                <SearchIcon className="mr-2 h-4 w-4" />
                <span>Electronic music</span>
              </CommandItem>
              <CommandItem>
                <SearchIcon className="mr-2 h-4 w-4" />
                <span>Jazz classics</span>
              </CommandItem>
              <CommandItem>
                <SearchIcon className="mr-2 h-4 w-4" />
                <span>Lo-fi beats</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </form>
      </CommandDialog>
    </>
  );
}
