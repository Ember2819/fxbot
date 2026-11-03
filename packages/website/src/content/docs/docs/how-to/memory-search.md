---
title: "Choose where memory search's vectors come from"
description: "Bots find their memories and earlier chats by words, and by meaning with vectors from an embedding model. By default, the vectors come from a local embedder on the machine's CPU. You can move it to an NVIDIA GPU, use a provider's embedding model instead, or turn vectors off. How search uses them: see Search by words and by meaning."
---

Bots find their memories and earlier chats by words, and by meaning with vectors from an embedding model. By default, the vectors come from a local embedder on the machine's CPU. You can move it to an NVIDIA GPU, use a provider's embedding model instead, or turn vectors off. How search uses them: see [Search by words and by meaning](/docs/explanation/bots-and-chats/#search-by-words-and-by-meaning).

| Choice | What it uses |
| --- | --- |
| **Local, on the CPU** | The default. The machine's `embed` container: llama.cpp's server with EmbeddingGemma 2. It downloads the model, 310 MB, on its first start, holds about 380 MB of memory, and gives way to everything else that needs the CPU. |
| **Local, on a GPU** | The same container on an NVIDIA GPU, with Qwen3-Embedding-0.6B. See [On a GPU](#on-a-gpu). |
| **A provider's embedding model** | A provider in Settings that serves embeddings. See [From a provider](#from-a-provider). |
| **Off: words only** | No vectors. Search uses words alone. |

The local choices need an install made by `setup.sh`, which runs `embed` as one of its containers. **Off** and a provider leave `embed` out, so it uses nothing. A checkout's local embedder is the one `deploy/compose.dev.yaml` runs, on the CPU, and Settings can't move it.

## Pick one

1. Open **Settings**. **Memory search** is below Providers.
2. Under **Where vectors come from**, pick one of the choices. A local choice, or **Off**, asks the machine to start, move, or stop `embed`. While it does, the line below says so, such as **Switching the local embedder to the GPU…**.
3. Read the line below the choices. Once vectors are on, it names the model and how far they have got:

   ```
   On: embeddinggemma-2 on the CPU. 12 of 40 memories and 1,204 of 5,690 messages have vectors.
   ```

   With **Off**, it says **Off: memories and earlier chats are searched by words.** When something failed, it shows the last error.

The counts rise while fxbot fills in the missing vectors, memories first, then messages, newest first, 32 to a request. A new choice means a new model, and so new vectors for everything. Search keeps working meanwhile, with the vectors the new model has made, and with words.

On the CPU, the embedder handled about 600 tokens a second on 6 cores, when measured: under a second for a 2,000-character reply, and about 7 minutes for 1,000 earlier messages of 1,000 characters each. Chats don't wait for it.

## On a GPU

You need:

- an install made by `setup.sh`
- an NVIDIA GPU, with NVIDIA's driver, so that `nvidia-smi` works on the machine
- the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html), set up for your engine. With podman, that is a CDI spec: `sudo nvidia-ctk cdi generate --output=/etc/cdi/nvidia.yaml`. With docker, it is `sudo nvidia-ctk runtime configure --runtime=docker`, then `sudo systemctl restart docker`.

Then pick **Local, on a GPU**. Before it switches, the machine makes a trial run: `nvidia-smi` in llama.cpp's CUDA image, with the GPU. If no GPU answers, the embedder stays where it was, and the line says **No GPU answered a trial run. A GPU needs NVIDIA's driver and container toolkit on the machine.** The first switch downloads llama.cpp's CUDA image, about 2.6 GB, and the model, 639 MB.

On a fresh install, `setup.sh` makes this switch itself when `nvidia-smi` works on the machine, and stays on the CPU if the trial run fails.

## From a provider

1. If you don't have one yet, [add a provider](/docs/how-to/add-a-provider/) that serves embeddings: an OpenAI, OpenRouter, or AI Gateway key, a Vercel account, Ollama, LM Studio, or another OpenAI-style server. A Vercel account hasn't been tested.
2. In **Memory search**, pick **A provider's embedding model**.
3. Pick the **Provider**, and type an **Embedding model** that it serves. fxbot suggests `text-embedding-3-small` for OpenAI, `openai/text-embedding-3-small` for OpenRouter, AI Gateway, and a Vercel account, and `nomic-embed-text` for Ollama, which must have pulled it first (`ollama pull nomic-embed-text`).
4. Choose **Use this model**. fxbot embeds a test string first. If that fails, it keeps the old setting and shows why.

The provider receives the text of every memory and message it turns into a vector. Picking a provider also turns the machine's `embed` container off. If you remove the provider later, search uses words alone until you pick another choice.

## Vectors for chat messages

Memories always get vectors while vectors are on. Chat messages get them too by default, from the first 8,000 characters of each, so `chat_history` finds earlier messages by meaning. Each message's vector adds about 4 KB to the database.

- To give vectors to memories only, turn off **Vectors for chat messages too**. `chat_history` then searches by words.
- To embed more or less of each message, change the number in **From the first … characters of each**. It applies to messages embedded after the change. Messages that have vectors keep them.

## From a shell

On an install made by `setup.sh`, the machine's `fxbot` command switches the local embedder too, with the same trial run before `gpu`:

```sh
sudo fxbot embedder gpu       # or cpu, or off
```

It changes what the machine runs, not where fxbot takes its vectors from. After `off`, pick **Off** in Settings as well, or the line says the local embedder isn't answering. More in [Commands](/docs/reference/commands/#fxbot-embedder).

## When it goes differently

- **The line says the local embedder isn't answering yet.** On its first start, it downloads its model. Until it answers, search uses words, and the vectors wait. Its log: `sudo fxbot logs embed`.
- **Local, on a GPU can't be picked.** It needs an install made by `setup.sh`.
- **The line says no GPU answered a trial run.** The machine lacks one of the things in [On a GPU](#on-a-gpu). The embedder stays where it was.
- **The embedding model didn't answer.** The test string failed, and the old setting stays. Check the model's id, and that the provider serves it.
- **Settings says none of your providers serves embeddings.** Add one of the kinds in [From a provider](#from-a-provider). ChatGPT and Grok plans, and OpenCode keys, serve none.
