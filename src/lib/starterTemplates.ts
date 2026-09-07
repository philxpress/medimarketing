/**
 * Built-in starter templates for common medical B2B campaigns.
 * Users can pick one to prefill the composer, then edit freely.
 */
export interface StarterTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: "starter-intro",
    name: "New product introduction",
    subject: "A quick introduction for {{practiceName}}",
    body: `<p>Hi {{firstName}},</p>
<p>I'm reaching out to introduce something I think could help {{practiceName}} — a simple way to [describe your product/service in one line].</p>
<ul>
  <li>Benefit one that matters to a busy practice</li>
  <li>Benefit two, kept concrete</li>
  <li>Benefit three</li>
</ul>
<p>Would a short call next week be useful? Reply and I'll send a couple of times.</p>
<p>Best regards,<br/>[Your name]</p>`,
  },
  {
    id: "starter-webinar",
    name: "Webinar / event invite",
    subject: "You're invited: [topic] for {{specialty}} practices",
    body: `<p>Hi {{firstName}},</p>
<p>We're hosting a short online session on <strong>[topic]</strong> for {{specialty}} practices, and thought {{practiceName}} might find it valuable.</p>
<p><strong>When:</strong> [date &amp; time]<br/>
<strong>Where:</strong> Online (link sent after registering)</p>
<p><a href="https://example.com/register">Save your seat</a></p>
<p>Hope to see you there,<br/>[Your name]</p>`,
  },
  {
    id: "starter-followup",
    name: "Follow-up / check-in",
    subject: "Following up with {{practiceName}}",
    body: `<p>Hi {{firstName}},</p>
<p>Just circling back on my previous note. I know things get busy at {{practiceName}}, so no pressure at all.</p>
<p>If it's helpful, I'm happy to share a one-page overview or answer any quick questions by email.</p>
<p>Warm regards,<br/>[Your name]</p>`,
  },
  {
    id: "starter-newsletter",
    name: "Monthly update",
    subject: "This month from [your company]",
    body: `<p>Hi {{firstName}},</p>
<p>Here's a quick roundup for {{practiceName}} this month:</p>
<h3>Highlight one</h3>
<p>A sentence or two.</p>
<h3>Highlight two</h3>
<p>A sentence or two.</p>
<p><a href="https://example.com">Read more on our site</a></p>
<p>Until next time,<br/>[Your name]</p>`,
  },
];
