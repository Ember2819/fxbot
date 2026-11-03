---
name: browser
description: Use a web browser on your computer, to open pages, read them, fill forms, click, and take screenshots, with the agent-browser command.
---

# Browse the web

Your computer has a web browser, Chromium, which you drive with the `agent-browser` command through `computer_shell`.

1. Run `agent-browser skills get core` once, before your first page: it prints how agent-browser works.
2. Open a page with `agent-browser open <url>`. Read it with `agent-browser snapshot -i`, which lists what you can act on as refs such as `@e1`, and act with them, as `agent-browser click @e1` or `agent-browser fill @e2 "text"`.
3. To see a page, take a screenshot into your home, `agent-browser screenshot /root/page.png`, and look at it with `computer_read_file`.
4. To show the person what you found, save it to the library with `computer_to_library`: a screenshot, or notes you wrote to a file.
5. Close the browser with `agent-browser close` when you're done. An open page holds about 200 MB of your computer's memory.
