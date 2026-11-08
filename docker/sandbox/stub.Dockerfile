# TEST ONLY. A fake "Codex" used by Staplr's Docker tests: it never contacts any
# provider and its credentials are not real. The real login image is codex.Dockerfile.
FROM alpine:3.20
RUN adduser -D -h /home/agent -u 10001 agent
COPY stub/stub-login stub/stub-status stub/stub-probe stub/stub-models /usr/local/bin/
RUN chmod 0555 /usr/local/bin/stub-login /usr/local/bin/stub-status /usr/local/bin/stub-probe /usr/local/bin/stub-models
USER agent
WORKDIR /home/agent
ENV HOME=/home/agent
CMD ["sleep", "infinity"]
