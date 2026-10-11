# Asyntai AI Chatbot for Twenty

Every lead from your Asyntai AI chatbot becomes a person in Twenty, with the full website conversation on their record.

Asyntai is an AI chatbot for your website. It answers visitors from your own website content, day and night, and asks for an email address or a phone number when a visitor wants a reply. This app brings those leads into Twenty.

## What you get

- **New leads as people.** A visitor who leaves an email address or a phone number becomes a person in Twenty. A visitor who is already in Twenty gets the chat on their existing record.
- **The full conversation as a note.** Every message from the visitor, the AI chatbot and your human agents, with the page and the time. When the visitor writes again, the same note is brought up to date.
- **Three fields on every person:** Last website chat, Website chats and Chat page. Sort, filter and build workflows on them.
- **An "Asyntai leads" view** in the sidebar: every person the chatbot brought in, newest chat first.
- **A workflow action, "Get Asyntai chats":** give it an email address, and the next step receives the text of that person's newest chat.

## Get started

1. Sign in to [Asyntai](https://asyntai.com), open **Settings**, then **API**, and copy your API key. The API needs the Starter plan or higher.
2. Install **Asyntai AI Chatbot** from the Twenty marketplace.
3. Open the app's **Variables** tab, paste the key into **Asyntai API key**, and press **Save settings**.

The leads of the last 30 days appear under **Asyntai leads**, and new leads follow on their own every five minutes.

To bring in leads from one website only, type its domain, for example `example.com`, into the **Website** variable.

## Help

- Guide: https://asyntai.com/documentation/integrations/twenty/
- Email: hello@asyntai.com

## Development

The app is built with the [Twenty app SDK](https://docs.twenty.com/developers/extend/apps/getting-started/quick-start).

```bash
yarn install
yarn twenty docker:start   # local Twenty server on http://localhost:2020
yarn twenty dev            # sync the app into it
yarn test:unit             # unit tests
yarn test                  # integration tests against the local server
```

## License

MIT
