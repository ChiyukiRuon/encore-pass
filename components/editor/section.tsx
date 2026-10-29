import { useId } from 'react'
import type { ReactNode } from 'react'

// iOS-style inset grouped section: heading above, rows in a card, footnote below.
export function Section({
    step,
    title,
    description,
    footer,
    action,
    children,
}: {
    step?: number
    title: string
    description: string
    footer?: ReactNode
    action?: ReactNode
    children: ReactNode
}) {
    const id = useId()
    return (
        <section className="group" aria-labelledby={id}>
            <header className="group-header">
                {step && (
                    <span className="step" aria-hidden="true">
                        {step}
                    </span>
                )}
                <div>
                    <h2 id={id}>{title}</h2>
                    <p>{description}</p>
                </div>
                {action && <div className="group-header-actions">{action}</div>}
            </header>
            <div className="group-card">{children}</div>
            {footer && <div className="group-footer">{footer}</div>}
        </section>
    )
}
