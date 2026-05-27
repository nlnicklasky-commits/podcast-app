export default function TermsOfService() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">Terms of Service</h1>
        <p className="text-[13px] mute mb-8">Last Updated: May 24, 2026</p>

        <div className="space-y-8 text-[14px] leading-relaxed dim">
          <section>
            <h2 className="text-lg font-semibold text-[var(--text)] mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing or using the PodBrain application ("Service"), you agree to be bound by these
              Terms of Service ("Terms"). If you do not agree to all of these Terms, do not use the Service.
              We may update these Terms from time to time; continued use after changes constitutes acceptance
              of the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--text)] mb-3">2. Description of Service</h2>
            <p className="mb-3">
              PodBrain is a podcast knowledge base tool that allows you to organize podcast episodes by
              topic, process publicly available podcast audio into text-based formats, and interact with
              that content through AI-powered search and chat. Specifically, the Service:
            </p>
            <ul className="list-disc pl-5 space-y-1 mb-4">
              <li>Retrieves podcast audio from publicly available RSS feeds via the Podcast Index directory;</li>
              <li>Transcribes audio using automated speech recognition;</li>
              <li>Generates AI-powered summaries, key points, topic extraction, and other analytical outputs;</li>
              <li>Provides a conversational AI interface for querying across processed podcast content with source citations.</li>
            </ul>
            <p>
              The Service processes third-party podcast content. It does not host or redistribute original
              audio files. Audio is temporarily downloaded for processing and deleted after transcription is complete.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--text)] mb-3">3. User Accounts and Responsibilities</h2>
            <p className="mb-3">
              User authentication is not currently implemented. When accounts are introduced, you will be
              responsible for maintaining the confidentiality of your credentials and for all activity under
              your account. You agree to provide accurate information and to notify us promptly of any
              unauthorized use.
            </p>
            <p>You must be at least 13 years of age to use the Service.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--text)] mb-3">4. Acceptable Use Policy</h2>
            <p className="mb-3">You agree not to use the Service to:</p>
            <ul className="list-disc pl-5 space-y-1 mb-4">
              <li>Violate any applicable law or regulation;</li>
              <li>Infringe the intellectual property rights of any third party;</li>
              <li>Redistribute, publicly display, or commercially exploit full-text transcripts or other processed content derived from podcast episodes;</li>
              <li>Attempt to extract or scrape data from the Service through automated means;</li>
              <li>Use processed podcast content in a manner that substitutes for listening to the original episode or that harms the podcast creator's audience, advertising revenue, or distribution;</li>
              <li>Interfere with the operation of the Service or its underlying infrastructure.</li>
            </ul>
            <p>
              Processed content is provided strictly for personal, non-commercial research and reference.
              You may not republish transcripts, summaries, or AI-generated outputs as standalone content.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--text)] mb-3">5. Intellectual Property</h2>

            <p className="mb-3">
              <strong className="text-[var(--text)]">Your Data.</strong> You retain ownership of any content
              you create within the Service, including knowledge base names, organizational structures, and
              chat queries. We claim no ownership over your inputs.
            </p>

            <p className="mb-3">
              <strong className="text-[var(--text)]">Podcast Content.</strong> All podcast audio, spoken content,
              and associated metadata remain the intellectual property of their respective creators, producers,
              and rights holders. The Service does not claim any ownership over podcast content. Transcripts and
              text derived from podcast audio are derivative of the original copyrighted works and are provided
              solely as a functional component of the Service for your personal use.
            </p>

            <p className="mb-3">
              <strong className="text-[var(--text)]">AI-Generated Outputs.</strong> Summaries, key points, topic
              extractions, entity lists, and chat responses are generated by third-party AI models (OpenAI). These
              outputs are provided for your personal informational use. We make no claim of copyright over
              AI-generated outputs, and we do not guarantee that such outputs are eligible for copyright protection.
              You should not rely on AI-generated content as a substitute for the original source material.
            </p>

            <p>
              <strong className="text-[var(--text)]">Service Materials.</strong> The PodBrain application code,
              design, and branding are the property of Nick Lasky. These Terms do not grant you any rights to the
              Service's underlying technology.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--text)] mb-3">6. Third-Party Content and Services</h2>
            <p className="mb-3">
              The Service retrieves podcast data from third-party sources, including the Podcast Index API and
              podcast RSS feeds. We do not control, endorse, or guarantee the accuracy, completeness, or availability
              of any third-party podcast content.
            </p>
            <p className="mb-3">
              <strong className="text-[var(--text)]">YouTube Content (Fallback).</strong> The Service may offer the
              ability to process content from YouTube URLs as a secondary method. YouTube content is governed by
              YouTube's own{' '}
              <a href="https://youtube.com/t/terms" className="text-[var(--accent)] hover:underline" target="_blank" rel="noopener noreferrer">
                Terms of Service
              </a>.
              Processing YouTube content through third-party extraction tools may not be authorized by YouTube,
              and you assume all risk associated with using this feature.
            </p>
            <p>
              <strong className="text-[var(--text)]">Podcast Creator Rights.</strong> If you are a podcast creator
              and believe the Service is processing your content in a manner you have not authorized, please contact
              us at the address in Section 13. We will promptly review and address your request, including removing
              processed content derived from your episodes.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--text)] mb-3">7. AI-Generated Content Disclaimer</h2>
            <p className="mb-3">
              The Service uses automated speech recognition and large language models to generate transcripts,
              summaries, insights, and chat responses. This content is produced by machine and is not verified by humans.
            </p>
            <p className="mb-3">
              <strong className="text-[var(--text)]">No guarantee of accuracy.</strong> Transcripts may contain errors,
              omissions, or misattributions. AI-generated summaries and insights may misrepresent, oversimplify, or
              inaccurately characterize the original content.
            </p>
            <p className="mb-3">
              <strong className="text-[var(--text)]">Not professional advice.</strong> AI-generated outputs do not
              constitute legal, medical, financial, or other professional advice. Do not make important decisions
              based solely on AI-generated content from this Service.
            </p>
            <p>
              <strong className="text-[var(--text)]">Source verification.</strong> Always refer to the original podcast
              episode to verify any claims, quotes, or facts surfaced through the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--text)] mb-3">8. Limitation of Liability</h2>
            <p className="mb-3">
              To the maximum extent permitted by applicable law, Nick Lasky and any contributors to PodBrain shall
              not be liable for any indirect, incidental, special, consequential, or punitive damages arising from
              your use of or inability to use the Service, including but not limited to damages for loss of data,
              revenue, or business opportunities.
            </p>
            <p>
              Our total aggregate liability for any claim arising from or related to these Terms or the Service
              shall not exceed the amount you have paid to use the Service in the twelve months preceding the claim,
              or fifty U.S. dollars ($50), whichever is greater.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--text)] mb-3">9. Disclaimer of Warranties</h2>
            <p className="mb-3">
              The Service is provided "AS IS" and "AS AVAILABLE" without warranties of any kind, whether express,
              implied, or statutory. We disclaim all warranties, including but not limited to implied warranties of
              merchantability, fitness for a particular purpose, accuracy, and non-infringement.
            </p>
            <p>
              We do not warrant that the Service will be uninterrupted, error-free, or free of harmful components,
              or that any content processed through the Service will be accurate or complete.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--text)] mb-3">10. Termination</h2>
            <p className="mb-3">
              We may suspend or terminate your access to the Service at any time, with or without cause, and with
              or without notice. Upon termination, your right to use the Service ceases immediately. Sections 5
              through 9 of these Terms survive termination.
            </p>
            <p>
              You may stop using the Service at any time. If account functionality is available, you may request
              deletion of your data by contacting us at the address in Section 13.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--text)] mb-3">11. Governing Law</h2>
            <p>
              These Terms shall be governed by and construed in accordance with the laws of the United States,
              without regard to conflict-of-law principles. Any disputes arising from these Terms or the Service
              shall be resolved in the applicable courts.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--text)] mb-3">12. Changes to Terms</h2>
            <p>
              We reserve the right to modify these Terms at any time. Material changes will be communicated
              through the Service interface or by other reasonable means. Your continued use of the Service
              after such changes constitutes acceptance of the updated Terms. We encourage you to review these
              Terms periodically.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--text)] mb-3">13. Contact Information</h2>
            <p className="mb-2">For questions, concerns, or content removal requests related to these Terms or the Service:</p>
            <p>
              <strong className="text-[var(--text)]">Nick Lasky</strong><br />
              Email:{' '}
              <a href="mailto:nl.nicklasky@gmail.com" className="text-[var(--accent)] hover:underline">
                nl.nicklasky@gmail.com
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
